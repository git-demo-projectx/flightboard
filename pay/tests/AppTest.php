<?php

declare(strict_types=1);

namespace Flightboard\Pay\Tests;

use Flightboard\Pay\App;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class AppTest extends TestCase
{
    public function testHealth(): void
    {
        [$status, $body] = (new App())->handle('GET', '/health', '');

        self::assertSame(200, $status);
        self::assertSame(['status' => 'ok'], $body);
    }

    public function testQuote(): void
    {
        [$status, $body] = (new App())->handle('POST', '/quote', '{"type":"Fixed","rate":180}');

        self::assertSame(200, $status);
        self::assertSame([
            'type' => 'Fixed',
            'lines' => [['label' => 'Labor - Fixed pay', 'amount' => 180.0]],
            'total' => 180.0,
        ], $body);
    }

    public function testQuoteWithTwoExpenses(): void
    {
        [$status, $body] = (new App())->handle('POST', '/quote', json_encode([
            'type' => 'Hourly',
            'rate' => 65,
            'hours' => 4,
            'expenses' => [
                ['category' => 'Parts', 'amountCents' => 4599],
                ['category' => 'Travel', 'amountCents' => 1250],
            ],
        ], JSON_THROW_ON_ERROR));

        self::assertSame(200, $status);
        self::assertSame([
            'type' => 'Hourly',
            'lines' => [
                ['label' => 'Labor - Hourly pay (4 hr x $65.00)', 'amount' => 260.0],
                ['label' => 'Expense - Parts', 'amount' => 45.99],
                ['label' => 'Expense - Travel', 'amount' => 12.5],
            ],
            'total' => 318.49,
        ], $body);
    }

    public function testQuoteWithAdjustments(): void
    {
        [$status, $body] = (new App())->handle('POST', '/quote', json_encode([
            'type' => 'Hourly',
            'rate' => 65,
            'hours' => 4,
            'adjustments' => [
                ['kind' => 'Bonus', 'reason' => 'Weekend call-out', 'amountCents' => 5000],
                ['kind' => 'Deduction', 'reason' => 'Late arrival', 'amountCents' => 1500],
            ],
        ], JSON_THROW_ON_ERROR));

        self::assertSame(200, $status);
        self::assertSame([
            'type' => 'Hourly',
            'lines' => [
                ['label' => 'Labor - Hourly pay (4 hr x $65.00)', 'amount' => 260.0],
                ['label' => 'Bonus - Weekend call-out', 'amount' => 50.0],
                ['label' => 'Deduction - Late arrival', 'amount' => -15.0],
            ],
            'total' => 295.0,
        ], $body);
    }

    public static function invalidAdjustments(): array
    {
        return PayCalculatorTest::invalidAdjustments() + [
            'numeric-key object list' => [(object) [
                ['kind' => 'Bonus', 'reason' => 'Weekend call-out', 'amountCents' => 2500],
            ], 'adjustments must be a list'],
            'negative total' => [[
                ['kind' => 'Deduction', 'reason' => 'Correction', 'amountCents' => 10001],
            ], 'deductions must not exceed the rest of the pay'],
        ];
    }

    #[DataProvider('invalidAdjustments')]
    public function testQuoteWithInvalidAdjustments(mixed $adjustments, string $error): void
    {
        [$status, $body] = (new App())->handle('POST', '/quote', json_encode([
            'type' => 'Fixed',
            'rate' => 100,
            'adjustments' => $adjustments,
        ], JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION));

        self::assertSame(400, $status);
        self::assertSame(['error' => $error], $body);
    }

    public function testQuoteWithEmptyExpenses(): void
    {
        $app = new App();

        self::assertSame(
            $app->handle('POST', '/quote', '{"type":"Fixed","rate":180}'),
            $app->handle('POST', '/quote', '{"type":"Fixed","rate":180,"expenses":[]}'),
        );
    }

    public function testQuoteWithWholeDollarExpense(): void
    {
        [$status, $body] = (new App())->handle(
            'POST',
            '/quote',
            '{"type":"Fixed","rate":180,"expenses":[{"category":"Parts","amountCents":100}]}',
        );

        self::assertSame(200, $status);
        self::assertSame(['label' => 'Expense - Parts', 'amount' => 1.0], $body['lines'][1]);
        self::assertSame(181.0, $body['total']);
    }

    public function testQuoteWithFractionalDollarExpenses(): void
    {
        [$status, $body] = (new App())->handle(
            'POST',
            '/quote',
            '{"type":"Fixed","rate":180,"expenses":[{"category":"Parts","amountCents":10},{"category":"Travel","amountCents":20}]}',
        );

        self::assertSame(200, $status);
        self::assertSame(['label' => 'Expense - Parts', 'amount' => 0.1], $body['lines'][1]);
        self::assertSame(['label' => 'Expense - Travel', 'amount' => 0.2], $body['lines'][2]);
        self::assertSame(180.3, $body['total']);
    }

    /** @return array<string, array{0: mixed, 1: string}> */
    public static function invalidExpenses(): array
    {
        $categoryError = 'expense category must be a non-empty string';
        $amountError = 'expense amountCents must be a positive whole number';

        return [
            'missing category' => [[['amountCents' => 4599]], $categoryError],
            'empty category' => [[['category' => '', 'amountCents' => 4599]], $categoryError],
            'blank category' => [[['category' => ' ', 'amountCents' => 4599]], $categoryError],
            'non-string category' => [[['category' => 1, 'amountCents' => 4599]], $categoryError],
            'non-object entry' => [[null], $categoryError],
            'missing amount' => [[['category' => 'Parts']], $amountError],
            'zero amount' => [[['category' => 'Parts', 'amountCents' => 0]], $amountError],
            'negative amount' => [[['category' => 'Parts', 'amountCents' => -1]], $amountError],
            'fractional amount' => [[['category' => 'Parts', 'amountCents' => 45.99]], $amountError],
            'string amount' => [[['category' => 'Parts', 'amountCents' => '4599']], $amountError],
            'boolean amount' => [[['category' => 'Parts', 'amountCents' => true]], $amountError],
            'null expenses' => [null, 'expenses must be a list'],
            'string expenses' => ['Parts', 'expenses must be a list'],
            'object expenses' => [['category' => 'Parts', 'amountCents' => 4599], 'expenses must be a list'],
            'empty object expenses' => [new \stdClass(), 'expenses must be a list'],
            'numeric-key object expenses' => [(object) [
                ['category' => 'Parts', 'amountCents' => 100],
            ], 'expenses must be a list'],
        ];
    }

    #[DataProvider('invalidExpenses')]
    public function testQuoteWithInvalidExpenses(mixed $expenses, string $error): void
    {
        [$status, $body] = (new App())->handle('POST', '/quote', json_encode([
            'type' => 'Fixed',
            'rate' => 180,
            'expenses' => $expenses,
        ], JSON_THROW_ON_ERROR));

        self::assertSame(400, $status);
        self::assertSame(['error' => $error], $body);
    }

    public function testQuoteWithInvalidJson(): void
    {
        [$status, $body] = (new App())->handle('POST', '/quote', '{oops');

        self::assertSame(400, $status);
        self::assertSame('invalid JSON body', $body['error']);
    }

    public function testQuoteWithInvalidPay(): void
    {
        [$status] = (new App())->handle('POST', '/quote', '{"type":"Hourly","rate":10}');

        self::assertSame(400, $status);
    }

    public function testQuoteWithUnsupportedType(): void
    {
        [$status, $body] = (new App())->handle('POST', '/quote', '{"type":"Blended","rate":10}');

        self::assertSame(422, $status);
        self::assertStringContainsString('Blended', $body['error']);
    }

    public function testQuoteWithUnsupportedTypeAndExpenses(): void
    {
        [$status, $body] = (new App())->handle(
            'POST',
            '/quote',
            '{"type":"Blended","rate":10,"expenses":[{"category":"Parts","amountCents":4599}]}',
        );

        self::assertSame(422, $status);
        self::assertSame(['error' => 'Blended pay is not supported yet'], $body);
    }

    public function testQuotesApprovedSeedWorkOrders(): void
    {
        [$status, $body] = (new App())->handle(
            'POST',
            '/quotes',
            '{"items":[{"id":9631821,"pay":{"type":"Fixed","rate":140}},{"id":9631822,"pay":{"type":"PerDevice","rate":18,"devices":12}}]}',
        );

        self::assertSame(200, $status);
        self::assertSame([
            'items' => [
                ['id' => 9631821, 'labor' => 140.0, 'expenses' => 0.0, 'total' => 140.0],
                ['id' => 9631822, 'labor' => 216.0, 'expenses' => 0.0, 'total' => 216.0],
            ],
            'count' => 2,
            'total' => 356.0,
        ], $body);
    }

    #[DataProvider('batchApprovedExpenses')]
    public function testQuotesWithApprovedExpenses(array $pay): void
    {
        [$status, $body] = (new App())->handle('POST', '/quotes', json_encode([
            'items' => [['id' => 9631810, 'pay' => $pay, 'approvedExpenseCents' => 1800]],
        ], JSON_THROW_ON_ERROR));

        self::assertSame(200, $status);
        self::assertSame([
            'items' => [['id' => 9631810, 'labor' => 260.0, 'expenses' => 18.0, 'total' => 278.0]],
            'count' => 1,
            'total' => 278.0,
        ], $body);
    }

    public static function batchApprovedExpenses(): array
    {
        $pay = ['type' => 'Hourly', 'rate' => 65, 'hours' => 4];

        return [
            'approved expenses only' => [$pay],
            'nested expenses ignored' => [$pay + ['expenses' => [['category' => 'Parts', 'amountCents' => 4599]]]],
        ];
    }

    public function testQuotesRoundsGrandTotal(): void
    {
        [$status, $body] = (new App())->handle('POST', '/quotes', json_encode([
            'items' => array_map(
                static fn (int $id): array => ['id' => $id, 'pay' => ['type' => 'Fixed', 'rate' => 0.1]],
                [1, 2, 3],
            ),
        ], JSON_THROW_ON_ERROR));

        self::assertSame(200, $status);
        self::assertSame([
            'items' => [
                ['id' => 1, 'labor' => 0.1, 'expenses' => 0.0, 'total' => 0.1],
                ['id' => 2, 'labor' => 0.1, 'expenses' => 0.0, 'total' => 0.1],
                ['id' => 3, 'labor' => 0.1, 'expenses' => 0.0, 'total' => 0.1],
            ],
            'count' => 3,
            'total' => 0.3,
        ], $body);
    }

    #[DataProvider('invalidBatchBodies')]
    public function testQuotesWithInvalidItems(string $request, string $error): void
    {
        [$status, $body] = (new App())->handle('POST', '/quotes', $request);

        self::assertSame(400, $status);
        self::assertSame(['error' => $error], $body);
    }

    public static function invalidBatchBodies(): array
    {
        $item = ['id' => 9631821, 'pay' => ['type' => 'Fixed', 'rate' => 140]];
        $listError = 'items must be a list of 1 to 100 work orders';
        $idError = 'item 1: id must be a positive whole number';
        $expenseError = 'item 1: approvedExpenseCents must be a whole number of 0 or more';

        return [
            'missing items' => ['{}', $listError],
            'empty items' => ['{"items":[]}', $listError],
            'object items' => ['{"items":{"a":1}}', $listError],
            'numeric-key object items' => ['{"items":{"0":{"id":1,"pay":{"type":"Fixed","rate":140}}}}', $listError],
            '101 items' => [json_encode(['items' => array_fill(0, 101, $item)], JSON_THROW_ON_ERROR), $listError],
            'scalar item' => ['{"items":[5]}', 'item 1: must be an object'],
            'string id' => ['{"items":[{"id":"9631821","pay":{"type":"Fixed","rate":140}}]}', $idError],
            'zero id' => ['{"items":[{"id":0,"pay":{"type":"Fixed","rate":140}}]}', $idError],
            'duplicate id' => [json_encode(['items' => [$item, $item]], JSON_THROW_ON_ERROR), 'item 2: duplicate id 9631821'],
            'string pay' => ['{"items":[{"id":9631821,"pay":"x"}]}', 'item 1: pay must be an object'],
            'negative expenses' => [json_encode(['items' => [$item + ['approvedExpenseCents' => -1]]], JSON_THROW_ON_ERROR), $expenseError],
            'fractional expenses' => [json_encode(['items' => [$item + ['approvedExpenseCents' => 12.5]]], JSON_THROW_ON_ERROR), $expenseError],
            'second item missing hours' => [json_encode(['items' => [$item, ['id' => 9631810, 'pay' => ['type' => 'Hourly', 'rate' => 65]]]], JSON_THROW_ON_ERROR), 'item 2: hours must be a number'],
        ];
    }

    #[DataProvider('invalidBatchJson')]
    public function testQuotesWithInvalidJson(string $request): void
    {
        self::assertSame(
            [400, ['error' => 'invalid JSON body']],
            (new App())->handle('POST', '/quotes', $request),
        );
    }

    public static function invalidBatchJson(): array
    {
        return [
            'malformed JSON' => ['not json'],
            'null JSON' => ['null'],
            'scalar JSON' => ['5'],
        ];
    }

    public function testGetQuotesIsNotFound(): void
    {
        self::assertSame(
            [404, ['error' => 'not found']],
            (new App())->handle('GET', '/quotes', ''),
        );
    }

    public function testUnknownRoute(): void
    {
        [$status] = (new App())->handle('GET', '/nope', '');

        self::assertSame(404, $status);
    }
}
