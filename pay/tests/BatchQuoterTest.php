<?php

declare(strict_types=1);

namespace Flightboard\Pay\Tests;

use Flightboard\Pay\BatchQuoter;
use Flightboard\Pay\InvalidPay;
use Flightboard\Pay\PayCalculator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class BatchQuoterTest extends TestCase
{
    public function testKeepsRequestOrderAndAddsApprovedExpenses(): void
    {
        $items = [
            ['id' => 2, 'pay' => ['type' => 'Hourly', 'rate' => 65, 'hours' => 4], 'approvedExpenseCents' => 1800],
            ['id' => 1, 'pay' => ['type' => 'PerDevice', 'rate' => 18, 'devices' => 12]],
        ];

        self::assertSame([
            'items' => [
                ['id' => 2, 'labor' => 260.0, 'expenses' => 18.0, 'total' => 278.0],
                ['id' => 1, 'labor' => 216.0, 'expenses' => 0.0, 'total' => 216.0],
            ],
            'count' => 2,
            'total' => 494.0,
        ], (new BatchQuoter(new PayCalculator()))->quote($items));
    }

    #[DataProvider('nestedExpenses')]
    public function testIgnoresNestedExpenses(mixed $expenses): void
    {
        $item = ['id' => 1, 'pay' => ['type' => 'Fixed', 'rate' => 140], 'approvedExpenseCents' => 1250];
        $quoter = new BatchQuoter(new PayCalculator());
        $expected = $quoter->quote([$item]);
        $item['pay']['expenses'] = $expenses;

        self::assertSame($expected, $quoter->quote([$item]));
    }

    public static function nestedExpenses(): array
    {
        return [
            'expense list' => [[['category' => 'Parts', 'amountCents' => 4599]]],
            'invalid expenses' => ['ignored'],
            'null expenses' => [null],
        ];
    }

    public function testRoundsItemAndGrandTotals(): void
    {
        self::assertSame([
            'items' => [
                ['id' => 1, 'labor' => 0.104, 'expenses' => 0.01, 'total' => 0.11],
                ['id' => 2, 'labor' => 0.104, 'expenses' => 0.02, 'total' => 0.12],
                ['id' => 3, 'labor' => 0.104, 'expenses' => 0.0, 'total' => 0.1],
            ],
            'count' => 3,
            'total' => 0.33,
        ], (new BatchQuoter(new PayCalculator()))->quote([
            ['id' => 1, 'pay' => ['type' => 'Fixed', 'rate' => 0.104], 'approvedExpenseCents' => 1],
            ['id' => 2, 'pay' => ['type' => 'Fixed', 'rate' => 0.104], 'approvedExpenseCents' => 2],
            ['id' => 3, 'pay' => ['type' => 'Fixed', 'rate' => 0.104], 'approvedExpenseCents' => 0],
        ]));
    }

    public function testAcceptsOneHundredItems(): void
    {
        $items = array_map(
            static fn (int $id): array => ['id' => $id, 'pay' => ['type' => 'Fixed', 'rate' => 1]],
            range(1, 100),
        );
        $quote = (new BatchQuoter(new PayCalculator()))->quote($items);

        self::assertSame(100, $quote['count']);
        self::assertCount(100, $quote['items']);
        self::assertSame(range(1, 100), array_column($quote['items'], 'id'));
        self::assertSame(100.0, $quote['total']);
    }

    #[DataProvider('invalidItems')]
    public function testRejectsInvalidItems(mixed $items, string $message): void
    {
        $this->expectException(InvalidPay::class);
        $this->expectExceptionMessage($message);

        (new BatchQuoter(new PayCalculator()))->quote($items);
    }

    public static function invalidItems(): array
    {
        $item = ['id' => 1, 'pay' => ['type' => 'Fixed', 'rate' => 140]];
        $listError = 'items must be a list of 1 to 100 work orders';
        $idError = 'item 1: id must be a positive whole number';
        $expenseError = 'item 1: approvedExpenseCents must be a whole number of 0 or more';

        return [
            'null list' => [null, $listError],
            'string list' => ['items', $listError],
            'object list' => [new \stdClass(), $listError],
            'empty list' => [[], $listError],
            'associative list' => [['a' => $item], $listError],
            'too many items before item validation' => [array_fill(0, 101, null), $listError],
            'scalar item' => [[5], 'item 1: must be an object'],
            'null item' => [[null], 'item 1: must be an object'],
            'missing id before pay' => [[[]], $idError],
            'string id' => [[array_replace($item, ['id' => '1'])], $idError],
            'zero id' => [[array_replace($item, ['id' => 0])], $idError],
            'negative id' => [[array_replace($item, ['id' => -1])], $idError],
            'float id' => [[array_replace($item, ['id' => 1.0])], $idError],
            'boolean id' => [[array_replace($item, ['id' => true])], $idError],
            'duplicate before pay' => [[$item, ['id' => 1]], 'item 2: duplicate id 1'],
            'missing pay' => [[['id' => 1]], 'item 1: pay must be an object'],
            'string pay before expenses' => [[['id' => 1, 'pay' => 'x', 'approvedExpenseCents' => -1]], 'item 1: pay must be an object'],
            'null expenses' => [[array_replace($item, ['approvedExpenseCents' => null])], $expenseError],
            'negative expenses' => [[array_replace($item, ['approvedExpenseCents' => -1])], $expenseError],
            'fractional expenses' => [[array_replace($item, ['approvedExpenseCents' => 12.5])], $expenseError],
            'string expenses' => [[array_replace($item, ['approvedExpenseCents' => '12'])], $expenseError],
            'boolean expenses' => [[array_replace($item, ['approvedExpenseCents' => true])], $expenseError],
            'expenses before calculator' => [[['id' => 1, 'pay' => [], 'approvedExpenseCents' => -1]], $expenseError],
            'second item calculator error' => [[$item, ['id' => 2, 'pay' => ['type' => 'Hourly', 'rate' => 65]]], 'item 2: hours must be a number'],
        ];
    }
}
