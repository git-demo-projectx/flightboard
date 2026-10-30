<?php

declare(strict_types=1);

namespace Flightboard\Pay;

/**
 * Computes what a provider earns for a work order.
 *
 * Input matches the `pay` object of a work order from the API:
 *   ['type' => 'Hourly', 'rate' => 65, 'hours' => 4]
 * Optional expenses and adjustments lists add expense, Bonus and Deduction lines.
 * Adjustments have kind, reason and positive amountCents (1 to 100000).
 *
 * Output is a quote:
 *   ['type' => 'Hourly', 'lines' => [['label' => ..., 'amount' => ...]], 'total' => 260.0]
 */
final class PayCalculator
{
    public const TYPES = ['Fixed', 'Hourly', 'PerDevice', 'Blended'];

    /**
     * @param array<string, mixed> $pay
     * @return array{type: string, lines: list<array{label: string, amount: float}>, total: float}
     */
    public function quote(array $pay): array
    {
        $type = $pay['type'] ?? null;
        if (!is_string($type) || !in_array($type, self::TYPES, true)) {
            throw new InvalidPay('pay type must be one of ' . implode(', ', self::TYPES));
        }
        $rate = $this->positiveNumber($pay, 'rate');

        $lines = match ($type) {
            'Fixed' => $this->fixed($rate),
            'Hourly' => $this->hourly($rate, $this->positiveNumber($pay, 'hours')),
            'PerDevice' => $this->perDevice($rate, (int) $this->positiveNumber($pay, 'devices')),
            'Blended' => throw new UnsupportedPayType('Blended pay is not supported yet'),
        };

        $expenses = array_key_exists('expenses', $pay) ? $pay['expenses'] : [];
        if (!is_array($expenses) || !array_is_list($expenses)) {
            throw new InvalidPay('expenses must be a list');
        }
        foreach ($expenses as $expense) {
            if (!is_array($expense) || !is_string($expense['category'] ?? null)
                || trim($expense['category']) === '') {
                throw new InvalidPay('expense category must be a non-empty string');
            }
            $amountCents = $expense['amountCents'] ?? null;
            if (!is_int($amountCents) || $amountCents <= 0) {
                throw new InvalidPay('expense amountCents must be a positive whole number');
            }
            $lines[] = ['label' => 'Expense - ' . $expense['category'], 'amount' => (float) $amountCents / 100];
        }

        $adjustments = array_key_exists('adjustments', $pay) ? $pay['adjustments'] : [];
        if (!is_array($adjustments) || !array_is_list($adjustments)) {
            throw new InvalidPay('adjustments must be a list');
        }
        if (count($adjustments) > 5) {
            throw new InvalidPay('adjustments must have at most 5 items');
        }
        foreach ($adjustments as $adjustment) {
            if (!is_array($adjustment) || !in_array($adjustment['kind'] ?? null, ['Bonus', 'Deduction'], true)) {
                throw new InvalidPay('adjustment kind must be Bonus or Deduction');
            }
            if (!is_string($adjustment['reason'] ?? null) || trim($adjustment['reason']) === '') {
                throw new InvalidPay('adjustment reason must be a non-empty string');
            }
            $amountCents = $adjustment['amountCents'] ?? null;
            if (!is_int($amountCents) || $amountCents < 1 || $amountCents > 100000) {
                throw new InvalidPay('adjustment amountCents must be a whole number from 1 to 100000');
            }
            $amount = (float) $amountCents / 100;
            $lines[] = [
                'label' => $adjustment['kind'] . ' - ' . $adjustment['reason'],
                'amount' => $adjustment['kind'] === 'Bonus' ? $amount : -$amount,
            ];
        }

        $total = array_sum(array_column($lines, 'amount'));
        if ($expenses !== [] || $adjustments !== []) {
            $total = round($total, 2);
        }
        if ($total < 0) {
            throw new InvalidPay('deductions must not exceed the rest of the pay');
        }

        return [
            'type' => $type,
            'lines' => $lines,
            'total' => $total,
        ];
    }

    /** @return list<array{label: string, amount: float}> */
    private function fixed(float $rate): array
    {
        return [['label' => 'Labor - Fixed pay', 'amount' => $rate]];
    }

    /** @return list<array{label: string, amount: float}> */
    private function hourly(float $rate, float $hours): array
    {
        $label = sprintf('Labor - Hourly pay (%s hr x %s)', $this->trim($hours), Money::format($rate));

        return [['label' => $label, 'amount' => round($rate * $hours, 2)]];
    }

    /** @return list<array{label: string, amount: float}> */
    private function perDevice(float $rate, int $devices): array
    {
        $label = sprintf('Labor - Per device pay (%d x %s)', $devices, Money::format($rate));

        return [['label' => $label, 'amount' => $rate * $devices]];
    }

    /** @param array<string, mixed> $pay */
    private function positiveNumber(array $pay, string $key): float
    {
        $value = $pay[$key] ?? null;
        if (!is_int($value) && !is_float($value)) {
            throw new InvalidPay("$key must be a number");
        }
        if ($value <= 0) {
            throw new InvalidPay("$key must be greater than zero");
        }

        return (float) $value;
    }

    private function trim(float $n): string
    {
        return rtrim(rtrim(number_format($n, 2, '.', ''), '0'), '.');
    }
}
