<?php

declare(strict_types=1);

namespace Flightboard\Pay;

/**
 * Computes what a provider earns for a work order.
 * Hourly hours over 8 are paid at 1.5 times the rate on an Overtime line.
 *
 * Input matches the `pay` object of a work order from the API:
 *   ['type' => 'Hourly', 'rate' => 65, 'hours' => 4]
 *
 * Output is a quote:
 *   ['type' => 'Hourly', 'lines' => [['label' => ..., 'amount' => ...]], 'total' => 260.0]
 */
final class PayCalculator
{
    public const TYPES = ['Fixed', 'Hourly', 'PerDevice', 'Blended'];

    private const REGULAR_HOURS = 8.0;
    private const OVERTIME_MULTIPLIER = 1.5;

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

        $total = array_sum(array_column($lines, 'amount'));

        return [
            'type' => $type,
            'lines' => $lines,
            'total' => count($lines) > 1 ? round($total, 2) : $total,
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
        $regularHours = min($hours, self::REGULAR_HOURS);
        $label = sprintf('Labor - Hourly pay (%s hr x %s)', $this->trim($regularHours), Money::format($rate));
        $lines = [['label' => $label, 'amount' => round($rate * $regularHours, 2)]];

        if ($hours > self::REGULAR_HOURS) {
            $overtimeHours = $hours - self::REGULAR_HOURS;
            $overtimeRate = $rate * self::OVERTIME_MULTIPLIER;
            $lines[] = [
                'label' => sprintf('Labor - Overtime (%s hr x %s)', $this->trim($overtimeHours), Money::format($overtimeRate)),
                'amount' => round($overtimeRate * $overtimeHours, 2),
            ];
        }

        return $lines;
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
