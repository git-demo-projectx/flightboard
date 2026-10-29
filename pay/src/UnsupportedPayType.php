<?php

declare(strict_types=1);

namespace Flightboard\Pay;

/** The pay type is valid but the service cannot compute it yet. Maps to HTTP 422. */
final class UnsupportedPayType extends \DomainException
{
}
