// Command flightboard-api serves the Flightboard REST API.
package main

import (
	"cmp"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/git-demo-projectx/flightboard/api/internal/httpapi"
	"github.com/git-demo-projectx/flightboard/api/internal/store"
)

func main() {
	addr := cmp.Or(os.Getenv("API_ADDR"), "127.0.0.1:8781")

	st, err := store.NewSeeded()
	if err != nil {
		slog.Error("load seed", "err", err)
		os.Exit(1)
	}

	srv := &http.Server{
		Addr:              addr,
		Handler:           logRequests(httpapi.New(st)),
		ReadHeaderTimeout: 5 * time.Second,
	}
	slog.Info("flightboard api listening", "addr", addr)
	if err := srv.ListenAndServe(); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		slog.Info("request", "method", r.Method, "path", r.URL.Path, "duration", time.Since(start))
	})
}
