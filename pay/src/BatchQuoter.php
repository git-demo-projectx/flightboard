<?php

declare(strict_types=1);

namespace Flightboard\Pay;

final class BatchQuoter
{
    public function __construct(private readonly PayCalculator $calculator)
    {
    }

    /** @return array{items: list<array{id: int, labor: float, expenses: float, total: float}>, count: int, total: float} */
    public function quote(mixed $items): array
    {
        if (!is_array($items) || !array_is_list($items) || count($items) < 1 || count($items) > 100) {
            throw new InvalidPay('items must be a list of 1 to 100 work orders');
        }

        $quoted = [];
        $seen = [];
        foreach ($items as $index => $item) {
            $prefix = 'item ' . ($index + 1) . ': ';
            if (!is_array($item)) {
                throw new InvalidPay($prefix . 'must be an object');
            }
            $id = $item['id'] ?? null;
            if (!is_int($id) || $id <= 0) {
                throw new InvalidPay($prefix . 'id must be a positive whole number');
            }
            if (isset($seen[$id])) {
                throw new InvalidPay($prefix . 'duplicate id ' . $id);
            }
            $seen[$id] = true;

            $pay = $item['pay'] ?? null;
            if (!is_array($pay)) {
                throw new InvalidPay($prefix . 'pay must be an object');
            }
            $approvedExpenseCents = array_key_exists('approvedExpenseCents', $item)
                ? $item['approvedExpenseCents'] : 0;
            if (!is_int($approvedExpenseCents) || $approvedExpenseCents < 0) {
                throw new InvalidPay($prefix . 'approvedExpenseCents must be a whole number of 0 or more');
            }

            unset($pay['expenses']);
            try {
                $quote = $this->calculator->quote($pay);
            } catch (InvalidPay | UnsupportedPayType $e) {
                throw new ($e::class)($prefix . $e->getMessage());
            }

            $labor = $quote['total'];
            $expenses = round($approvedExpenseCents / 100, 2);
            $quoted[] = [
                'id' => $id,
                'labor' => $labor,
                'expenses' => $expenses,
                'total' => round($labor + $expenses, 2),
            ];
        }

        return [
            'items' => $quoted,
            'count' => count($quoted),
            'total' => round(array_sum(array_column($quoted, 'total')), 2),
        ];
    }
}
