<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use Flightboard\Pay\App;

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
[$status, $payload] = (new App())->handle(
    $_SERVER['REQUEST_METHOD'] ?? 'GET',
    $path,
    (string) file_get_contents('php://input'),
);

http_response_code($status);
header('Content-Type: application/json');
echo json_encode($payload, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION);
