<?php

declare(strict_types=1);

namespace Flightboard\Pay\Tests;

use Flightboard\Pay\InvalidPay;
use Flightboard\Pay\PayCalculator;
use Flightboard\Pay\UnsupportedPayType;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class PayCalculatorTest extends TestCase
{
    private PayCalculator $calculator;

    protected function setUp(): void
    {
        $this->calculator = new PayCalculator();
    }

    public function testFixedPayIsTheRate(): void
    {
        $quote = $this->calculator->quote(['type' => 'Fixed', 'rate' => 250]);

        self::assertSame('Fixed', $quote['type']);
        self::assertSame(250.0, $quote['total']);
        self::assertSame('Labor - Fixed pay', $quote['lines'][0]['label']);
    }

    public function testHourlyPayMultipliesRateByHours(): void
    {
        $quote = $this->calculator->quote(['type' => 'Hourly', 'rate' => 65, 'hours' => 4]);

        self::assertSame(260.0, $quote['total']);
        self::assertSame('Labor - Hourly pay (4 hr x $65.00)', $quote['lines'][0]['label']);
    }

    public function testHourlyPayAcceptsFractionalHours(): void
    {
        $quote = $this->calculator->quote(['type' => 'Hourly', 'rate' => 70, 'hours' => 2.5]);

        self::assertSame(175.0, $quote['total']);
        self::assertStringContainsString('2.5 hr', $quote['lines'][0]['label']);
    }

    public function testPerDevicePayMultipliesRateByDevices(): void
    {
        $quote = $this->calculator->quote(['type' => 'PerDevice', 'rate' => 45, 'devices' => 6]);

        self::assertSame(270.0, $quote['total']);
        self::assertSame('Labor - Per device pay (6 x $45.00)', $quote['lines'][0]['label']);
    }

    public function testFixedPayWithBonus(): void
    {
        $quote = $this->calculator->quote([
            'type' => 'Fixed',
            'rate' => 100,
            'adjustments' => [
                ['kind' => 'Bonus', 'reason' => 'Weekend call-out', 'amountCents' => 2500,
                    'id' => 1, 'createdAt' => '2026-10-30T00:00:00Z'],
            ],
        ]);

        self::assertSame([
            'type' => 'Fixed',
            'lines' => [
                ['label' => 'Labor - Fixed pay', 'amount' => 100.0],
                ['label' => 'Bonus - Weekend call-out', 'amount' => 25.0],
            ],
            'total' => 125.0,
        ], $quote);
    }

    public function testHourlyPayWithExpenseBonusAndDeduction(): void
    {
        $quote = $this->calculator->quote([
            'type' => 'Hourly',
            'rate' => 65.125,
            'hours' => 1.5,
            'expenses' => [['category' => 'Parts', 'amountCents' => 10]],
            'adjustments' => [
                ['kind' => 'Bonus', 'reason' => 'Weekend call-out', 'amountCents' => 20],
                ['kind' => 'Deduction', 'reason' => 'Late arrival', 'amountCents' => 15],
            ],
        ]);

        self::assertSame([
            ['label' => 'Labor - Hourly pay (1.5 hr x $65.13)', 'amount' => 97.69],
            ['label' => 'Expense - Parts', 'amount' => 0.1],
            ['label' => 'Bonus - Weekend call-out', 'amount' => 0.2],
            ['label' => 'Deduction - Late arrival', 'amount' => -0.15],
        ], $quote['lines']);
        self::assertSame(97.84, $quote['total']);
    }

    public function testDeductionCanReduceTotalToZero(): void
    {
        $quote = $this->calculator->quote([
            'type' => 'Fixed',
            'rate' => 100,
            'adjustments' => [['kind' => 'Deduction', 'reason' => 'Correction', 'amountCents' => 10000]],
        ]);

        self::assertSame(-100.0, $quote['lines'][1]['amount']);
        self::assertSame(0.0, $quote['total']);
    }

    public function testDeductionCannotMakeTotalNegative(): void
    {
        $this->expectException(InvalidPay::class);
        $this->expectExceptionMessage('deductions must not exceed the rest of the pay');

        $this->calculator->quote([
            'type' => 'Fixed',
            'rate' => 100,
            'adjustments' => [['kind' => 'Deduction', 'reason' => 'Correction', 'amountCents' => 10001]],
        ]);
    }

    public function testEmptyAdjustmentsLeaveQuoteUnchanged(): void
    {
        $pay = ['type' => 'Fixed', 'rate' => 100.123];

        self::assertSame(100.123, $this->calculator->quote($pay)['total']);
        self::assertSame(
            $this->calculator->quote($pay),
            $this->calculator->quote($pay + ['adjustments' => []]),
        );
    }

    public function testFiveAdjustmentsAndAmountBoundariesAreAllowed(): void
    {
        $adjustments = array_fill(0, 4, ['kind' => 'Bonus', 'reason' => 'Small bonus', 'amountCents' => 1]);
        $adjustments[] = ['kind' => 'Bonus', 'reason' => 'Large bonus', 'amountCents' => 100000];
        $quote = $this->calculator->quote(['type' => 'Fixed', 'rate' => 100.123, 'adjustments' => $adjustments]);

        self::assertCount(6, $quote['lines']);
        self::assertSame(1100.16, $quote['total']);
    }

    /** @return array<string, array{0: mixed, 1: string}> */
    public static function invalidAdjustments(): array
    {
        $listError = 'adjustments must be a list';
        $kindError = 'adjustment kind must be Bonus or Deduction';
        $reasonError = 'adjustment reason must be a non-empty string';
        $amountError = 'adjustment amountCents must be a whole number from 1 to 100000';
        $valid = ['kind' => 'Bonus', 'reason' => 'Weekend call-out', 'amountCents' => 2500];

        return [
            'null list' => [null, $listError],
            'string list' => ['Bonus', $listError],
            'associative list' => [['first' => $valid], $listError],
            'empty object list' => [new \stdClass(), $listError],
            'too many items before item validation' => [array_fill(0, 6, null), 'adjustments must have at most 5 items'],
            'scalar item' => [[1], $kindError],
            'missing kind before reason' => [[[]], $kindError],
            'unknown kind' => [[array_replace($valid, ['kind' => 'Other'])], $kindError],
            'case-sensitive kind' => [[array_replace($valid, ['kind' => 'bonus'])], $kindError],
            'non-string kind' => [[array_replace($valid, ['kind' => true])], $kindError],
            'missing reason before amount' => [[['kind' => 'Bonus']], $reasonError],
            'empty reason' => [[array_replace($valid, ['reason' => ''])], $reasonError],
            'blank reason' => [[array_replace($valid, ['reason' => " \t\n"])], $reasonError],
            'non-string reason' => [[array_replace($valid, ['reason' => 1])], $reasonError],
            'missing amount' => [[['kind' => 'Bonus', 'reason' => 'Correction']], $amountError],
            'zero amount' => [[array_replace($valid, ['amountCents' => 0])], $amountError],
            'negative amount' => [[array_replace($valid, ['amountCents' => -1])], $amountError],
            'over maximum amount' => [[array_replace($valid, ['amountCents' => 100001])], $amountError],
            'fractional amount' => [[array_replace($valid, ['amountCents' => 1.5])], $amountError],
            'float amount' => [[array_replace($valid, ['amountCents' => 1.0])], $amountError],
            'string amount' => [[array_replace($valid, ['amountCents' => '2500'])], $amountError],
            'boolean amount' => [[array_replace($valid, ['amountCents' => true])], $amountError],
            'null amount' => [[array_replace($valid, ['amountCents' => null])], $amountError],
            'items validated in input order' => [[['kind' => 'Bonus'], []], $reasonError],
        ];
    }

    #[DataProvider('invalidAdjustments')]
    public function testRejectsInvalidAdjustments(mixed $adjustments, string $error): void
    {
        $this->expectException(InvalidPay::class);
        $this->expectExceptionMessage($error);

        $this->calculator->quote(['type' => 'Fixed', 'rate' => 100, 'adjustments' => $adjustments]);
    }

    public function testBlendedPayIsNotSupportedYet(): void
    {
        $this->expectException(UnsupportedPayType::class);

        $this->calculator->quote(['type' => 'Blended', 'rate' => 100]);
    }

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function invalidPay(): array
    {
        return [
            'missing type' => [['rate' => 10]],
            'unknown type' => [['type' => 'Barter', 'rate' => 10]],
            'missing rate' => [['type' => 'Fixed']],
            'string rate' => [['type' => 'Fixed', 'rate' => '10']],
            'zero rate' => [['type' => 'Fixed', 'rate' => 0]],
            'hourly without hours' => [['type' => 'Hourly', 'rate' => 10]],
            'negative devices' => [['type' => 'PerDevice', 'rate' => 10, 'devices' => -1]],
        ];
    }

    /** @param array<string, mixed> $pay */
    #[DataProvider('invalidPay')]
    public function testRejectsInvalidPay(array $pay): void
    {
        $this->expectException(InvalidPay::class);

        $this->calculator->quote($pay);
    }
}
