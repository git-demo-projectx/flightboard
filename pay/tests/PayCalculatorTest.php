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

    public function testHourlyPayAtEightHoursHasNoOvertime(): void
    {
        $quote = $this->calculator->quote(['type' => 'Hourly', 'rate' => 65, 'hours' => 8]);

        self::assertSame([
            ['label' => 'Labor - Hourly pay (8 hr x $65.00)', 'amount' => 520.0],
        ], $quote['lines']);
        self::assertSame(520.0, $quote['total']);
    }

    public function testHourlyPayOverEightHoursAddsOvertime(): void
    {
        $quote = $this->calculator->quote(['type' => 'Hourly', 'rate' => 65, 'hours' => 10]);

        self::assertSame([
            ['label' => 'Labor - Hourly pay (8 hr x $65.00)', 'amount' => 520.0],
            ['label' => 'Labor - Overtime (2 hr x $97.50)', 'amount' => 195.0],
        ], $quote['lines']);
        self::assertSame(715.0, $quote['total']);
    }

    public function testOvertimeAcceptsFractionalHours(): void
    {
        $quote = $this->calculator->quote(['type' => 'Hourly', 'rate' => 70, 'hours' => 8.25]);

        self::assertSame([
            ['label' => 'Labor - Hourly pay (8 hr x $70.00)', 'amount' => 560.0],
            ['label' => 'Labor - Overtime (0.25 hr x $105.00)', 'amount' => 26.25],
        ], $quote['lines']);
        self::assertSame(586.25, $quote['total']);
    }

    public function testOvertimeTotalIsRoundedToCents(): void
    {
        $quote = $this->calculator->quote(['type' => 'Hourly', 'rate' => 41.3, 'hours' => 9]);

        self::assertSame([
            ['label' => 'Labor - Hourly pay (8 hr x $41.30)', 'amount' => 330.4],
            ['label' => 'Labor - Overtime (1 hr x $61.95)', 'amount' => 61.95],
        ], $quote['lines']);
        self::assertSame(392.35, $quote['total']);
    }

    public function testPerDevicePayMultipliesRateByDevices(): void
    {
        $quote = $this->calculator->quote(['type' => 'PerDevice', 'rate' => 45, 'devices' => 6]);

        self::assertSame(270.0, $quote['total']);
        self::assertSame('Labor - Per device pay (6 x $45.00)', $quote['lines'][0]['label']);
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
