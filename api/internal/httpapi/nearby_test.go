package httpapi

import (
	"net/http"
	"reflect"
	"slices"
	"testing"

	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

func TestWorkOrderNearbyProviders(t *testing.T) {
	s := newTestServer(t)
	for _, tt := range []struct {
		id   string
		want []string
		body string
	}{
		{
			id: "9631805", want: []string{"p-101", "p-104"},
			body: `[{"id":"p-101","name":"Dana Whitfield","score":97,"city":"Minneapolis","state":"MN"},{"id":"p-104","name":"Tomas Lindqvist","score":89,"city":"Saint Paul","state":"MN"}]` + "\n",
		},
		{id: "9631809", want: []string{"p-101", "p-104"}},
		{id: "9631808", want: []string{"p-102"}},
		{id: "9631810", want: []string{"p-104"}},
		{id: "9631803", want: []string{}, body: "[]\n"},
	} {
		t.Run(tt.id, func(t *testing.T) {
			rec := do(t, s, "GET", "/api/work-orders/"+tt.id+"/nearby-providers", "")
			if rec.Code != http.StatusOK {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			if got := rec.Header().Get("Content-Type"); got != "application/json" {
				t.Errorf("Content-Type = %q", got)
			}
			providers := decode[[]workorder.Provider](t, rec)
			if providers == nil {
				t.Fatal("providers must be an array, not null")
			}
			ids := make([]string, 0, len(providers))
			for _, provider := range providers {
				ids = append(ids, provider.ID)
			}
			if !slices.Equal(ids, tt.want) {
				t.Errorf("provider ids = %v, want %v", ids, tt.want)
			}
			if tt.body != "" && rec.Body.String() != tt.body {
				t.Errorf("body = %q, want %q", rec.Body.String(), tt.body)
			}
		})
	}
}

func TestNearbyProviders(t *testing.T) {
	wo := workorder.WorkOrder{Location: workorder.Location{State: "mn"}, ProviderID: "assigned"}
	providers := []workorder.Provider{
		{ID: "first", State: "MN", Score: 97},
		{ID: "assigned", State: "MN", Score: 95},
		{ID: "other-state", State: "IL", Score: 92},
		{ID: "second", State: "MN", Score: 89},
	}
	before := slices.Clone(providers)
	got := nearbyProviders(wo, providers)
	want := []workorder.Provider{providers[0], providers[3]}
	if !slices.Equal(got, want) {
		t.Errorf("providers = %+v, want %+v", got, want)
	}
	if !slices.Equal(providers, before) {
		t.Error("filter changed input providers")
	}
	if got := nearbyProviders(wo, nil); got == nil || len(got) != 0 {
		t.Errorf("providers with no input = %v, want non-nil empty slice", got)
	}
}

func TestWorkOrderNearbyProvidersErrors(t *testing.T) {
	for _, tt := range []struct {
		id   string
		code int
		body string
	}{
		{id: "9999999", code: http.StatusNotFound, body: "{\"error\":\"not found\"}\n"},
		{id: "abc", code: http.StatusBadRequest, body: "{\"error\":\"id must be a number\"}\n"},
	} {
		t.Run(tt.id, func(t *testing.T) {
			rec := do(t, newTestServer(t), "GET", "/api/work-orders/"+tt.id+"/nearby-providers", "")
			if rec.Code != tt.code {
				t.Fatalf("code = %d, want %d body %s", rec.Code, tt.code, rec.Body)
			}
			if got := rec.Header().Get("Content-Type"); got != "application/json" {
				t.Errorf("Content-Type = %q", got)
			}
			if got := rec.Body.String(); got != tt.body {
				t.Errorf("body = %q, want %q", got, tt.body)
			}
		})
	}
}

func TestWorkOrderNearbyProvidersReadOnly(t *testing.T) {
	s := newTestServer(t)
	before, err := s.store.GetWorkOrder(9631810)
	if err != nil {
		t.Fatal(err)
	}
	providersBefore := s.store.ListProviders()
	rec := do(t, s, "GET", "/api/work-orders/9631810/nearby-providers", "not JSON")
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d body %s", rec.Code, rec.Body)
	}
	after, err := s.store.GetWorkOrder(9631810)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, after) {
		t.Error("listing changed the stored work order")
	}
	if !slices.Equal(providersBefore, s.store.ListProviders()) {
		t.Error("listing changed the stored providers")
	}
}
