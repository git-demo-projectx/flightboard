<?php

declare(strict_types=1);

namespace Flightboard\Pay;

/** The request describes pay that cannot be computed. Maps to HTTP 400. */
final class InvalidPay extends \InvalidArgumentException
{
}
