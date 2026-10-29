<?php

declare(strict_types=1);

namespace Flightboard\Pay;

final class Money
{
    /** Formats an amount in US dollars, for example 1234.5 => "$1,234.50". */
    public static function format(float $amount): string
    {
        return '$' . number_format($amount, 2);
    }
}
