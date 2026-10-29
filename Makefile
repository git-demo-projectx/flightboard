# Flightboard: one entry point for setup, dev, lint and test.
# PHP and Composer run through Docker when they are not installed locally.

PHP_IMAGE := php:8.3-cli
COMPOSER_IMAGE := composer:2
HAVE_PHP := $(shell command -v php >/dev/null 2>&1 && echo yes)
HAVE_COMPOSER := $(shell command -v composer >/dev/null 2>&1 && echo yes)

ifeq ($(HAVE_PHP),yes)
PHP := php
else
PHP := docker run --rm -v $(CURDIR)/pay:/app -w /app $(PHP_IMAGE) php
endif

ifeq ($(HAVE_COMPOSER),yes)
COMPOSER := composer --working-dir=pay
else
COMPOSER := docker run --rm -v $(CURDIR)/pay:/app -w /app $(COMPOSER_IMAGE) composer
endif

.PHONY: setup dev test lint build test-api test-pay test-web lint-api lint-web

setup:
	cd web && npm ci
	$(COMPOSER) install --no-interaction
	cd api && go mod download

dev:
	./scripts/dev.sh

test: test-api test-pay test-web

test-api:
	cd api && go test ./...

test-pay:
	cd pay && $(PHP) vendor/bin/phpunit

test-web:
	cd web && npm test

lint: lint-api lint-web

lint-api:
	cd api && test -z "$$(gofmt -l .)" && go vet ./...

lint-web:
	cd web && npm run lint && npm run typecheck

build:
	cd web && npm run build
	cd api && go build -o bin/flightboard-api ./cmd/flightboard-api
