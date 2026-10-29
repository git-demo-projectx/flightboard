package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"strconv"
	"testing"

	"github.com/git-demo-projectx/flightboard/api/internal/store"
	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

func TestAssignProvider(t *testing.T) {
	s := newTestServer(t)
	rec := do(t, s, "POST", "/api/work-orders/9631805/assign", `{"providerId":"p-104"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("assign code = %d body %s", rec.Code, rec.Body)
	}
	assigned := decode[workOrderView](t, rec)
	if assigned.Status != workorder.StatusAssigned || assigned.ProviderID != "p-104" || assigned.SubStatus != "" || assigned.Provider == nil || assigned.Provider.Name != "Tomas Lindqvist" {
		t.Fatalf("assigned work order = %+v", assigned)
	}
	rec = do(t, s, "GET", "/api/work-orders/9631805", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("get code = %d body %s", rec.Code, rec.Body)
	}
	if got := decode[workOrderView](t, rec); !reflect.DeepEqual(got, assigned) {
		t.Errorf("get work order = %+v, want %+v", got, assigned)
	}
	rec = do(t, s, "GET", "/api/work-orders/9631805/nearby-providers", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("nearby providers code = %d body %s", rec.Code, rec.Body)
	}
	for _, provider := range decode[[]workorder.Provider](t, rec) {
		if provider.ID == "p-104" {
			t.Error("assigned provider is still listed as nearby")
		}
	}
}

func TestAssignProviderDoubleBooking(t *testing.T) {
	for _, tt := range []struct {
		name, start, end string
		code             int
	}{
		{"overlap", "2026-10-22T10:00:00-05:00", "2026-10-22T12:00:00-05:00", http.StatusConflict},
		{"different zones", "2026-10-22T18:00:00Z", "2026-10-22T19:00:00Z", http.StatusConflict},
		{"touches the end", "2026-10-22T14:00:00-05:00", "2026-10-22T15:00:00-05:00", http.StatusOK},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s := newTestServer(t)
			body, err := json.Marshal(map[string]any{
				"title": "Install access points", "typeOfWork": "Networking", "status": "Published",
				"location": map[string]string{"city": "Edina", "state": "MN"},
				"pay":      map[string]any{"type": "Fixed", "rate": 100},
				"schedule": map[string]string{"start": tt.start, "end": tt.end},
			})
			if err != nil {
				t.Fatal(err)
			}
			rec := do(t, s, "POST", "/api/work-orders", string(body))
			if rec.Code != http.StatusCreated {
				t.Fatalf("create code = %d body %s", rec.Code, rec.Body)
			}
			created := decode[workOrderView](t, rec)
			path := "/api/work-orders/" + strconv.Itoa(created.ID)
			rec = do(t, s, "POST", path+"/assign", `{"providerId":"p-101"}`)
			if rec.Code != tt.code {
				t.Fatalf("assign code = %d body %s, want %d", rec.Code, rec.Body, tt.code)
			}
			if tt.code == http.StatusConflict {
				want := "conflict: Dana Whitfield is booked on work order 9631817 at that time"
				if got := decode[map[string]string](t, rec)["error"]; got != want {
					t.Errorf("error = %q, want %q", got, want)
				}
			} else {
				got := decode[workOrderView](t, rec)
				if got.Status != workorder.StatusAssigned || got.ProviderID != "p-101" || got.Provider == nil || got.Provider.Name != "Dana Whitfield" {
					t.Fatalf("assigned work order = %+v", got)
				}
			}
			rec = do(t, s, "GET", path, "")
			if rec.Code != http.StatusOK {
				t.Fatalf("get code = %d body %s", rec.Code, rec.Body)
			}
			got := decode[workOrderView](t, rec)
			if tt.code == http.StatusConflict {
				if !reflect.DeepEqual(got, created) {
					t.Errorf("failed assignment changed work order: %+v, want %+v", got, created)
				}
			} else if got.Status != workorder.StatusAssigned || got.ProviderID != "p-101" {
				t.Errorf("assignment not stored: %+v", got)
			}
		})
	}
}

func TestAssignProviderErrors(t *testing.T) {
	for _, tt := range []struct {
		name, path, body string
		code             int
		msg              string
	}{
		{"bad id", "/api/work-orders/abc/assign", `{"providerId":"p-101"}`, 400, "id must be a number"},
		{"not JSON", "/api/work-orders/9631805/assign", "not json", 400, "invalid JSON body"},
		{"missing provider", "/api/work-orders/9631805/assign", `{}`, 400, "invalid work order: providerId is required"},
		{"blank provider", "/api/work-orders/9631805/assign", `{"providerId":"  "}`, 400, "invalid work order: providerId is required"},
		{"unknown provider", "/api/work-orders/9631805/assign", `{"providerId":"p-999"}`, 400, `invalid work order: unknown provider "p-999"`},
		{"unknown work order", "/api/work-orders/1/assign", `{"providerId":"p-101"}`, 404, "not found"},
		{"Draft", "/api/work-orders/9631801/assign", `{"providerId":"p-101"}`, 409, "conflict: cannot move from Draft to Assigned"},
		{"Assigned", "/api/work-orders/9631810/assign", `{"providerId":"p-104"}`, 409, "conflict: cannot move from Assigned to Assigned"},
		{"Cancelled", "/api/work-orders/9631825/assign", `{"providerId":"p-101"}`, 409, "conflict: cannot move from Cancelled to Assigned"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s := newTestServer(t)
			before := s.store.ListWorkOrders(store.Filter{})
			rec := do(t, s, "POST", tt.path, tt.body)
			if rec.Code != tt.code {
				t.Fatalf("code = %d body %s, want %d", rec.Code, rec.Body, tt.code)
			}
			if rec.Header().Get("Content-Type") != "application/json" {
				t.Errorf("Content-Type = %q", rec.Header().Get("Content-Type"))
			}
			got := decode[map[string]string](t, rec)
			if len(got) != 1 || got["error"] != tt.msg {
				t.Errorf("error body = %v, want error %q", got, tt.msg)
			}
			if after := s.store.ListWorkOrders(store.Filter{}); !reflect.DeepEqual(before, after) {
				t.Error("failed assignment changed stored work orders")
			}
		})
	}
}

func TestAssignProviderMissingSchedule(t *testing.T) {
	s := newTestServer(t)
	rec := do(t, s, "POST", "/api/work-orders", `{"title":"Unscheduled","status":"Draft"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create code = %d body %s", rec.Code, rec.Body)
	}
	id := decode[woJSON](t, rec).ID
	path := "/api/work-orders/" + strconv.Itoa(id)
	rec = do(t, s, "POST", path+"/status", `{"status":"Routed"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("route code = %d body %s", rec.Code, rec.Body)
	}
	before := decode[workOrderView](t, rec)
	rec = do(t, s, "POST", path+"/assign", `{"providerId":"p-101"}`)
	want := fmt.Sprintf("conflict: work order %d has no schedule", id)
	if rec.Code != http.StatusConflict || decode[map[string]string](t, rec)["error"] != want {
		t.Fatalf("assign code = %d body %s, want 409 error %q", rec.Code, rec.Body, want)
	}
	rec = do(t, s, "GET", path, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("get code = %d body %s", rec.Code, rec.Body)
	}
	if got := decode[workOrderView](t, rec); !reflect.DeepEqual(before, got) {
		t.Error("failed assignment changed unscheduled work order")
	}
}
