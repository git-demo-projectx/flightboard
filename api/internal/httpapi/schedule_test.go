package httpapi

import (
	"net/http"
	"reflect"
	"testing"
	"time"

	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

func TestRescheduleWorkOrder(t *testing.T) {
	s := newTestServer(t)
	body := `{"start":"2026-11-03T09:00:00-06:00","end":"2026-11-03T13:00:00-06:00"}`
	rec := do(t, s, "POST", "/api/work-orders/9631804/schedule", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d body %s", rec.Code, rec.Body)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q", got)
	}
	got := decode[workOrderView](t, rec)
	start := time.Date(2026, 11, 3, 15, 0, 0, 0, time.UTC)
	end := start.Add(4 * time.Hour)
	if got.ID != 9631804 || got.Status != workorder.StatusPublished || got.Schedule == nil || !got.Schedule.Start.Equal(start) || !got.Schedule.End.Equal(end) {
		t.Fatalf("rescheduled work order = %+v, want Published and window %v to %v", got, start, end)
	}
	rec = do(t, s, "GET", "/api/work-orders/week?start=2026-11-02", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("new week code = %d body %s", rec.Code, rec.Body)
	}
	week := decode[weekView](t, rec)
	if week.Total != 1 {
		t.Fatalf("new week total = %d, want 1", week.Total)
	}
	found := false
	for _, day := range week.Days {
		for _, item := range day.WorkOrders {
			if item.ID == 9631804 {
				found = true
				if day.Date != "2026-11-03" || !item.Start.Equal(start) || !item.End.Equal(end) {
					t.Errorf("rescheduled week item on %s = %+v", day.Date, item)
				}
			}
		}
	}
	if !found {
		t.Fatal("rescheduled work order missing from new week")
	}
	rec = do(t, s, "GET", "/api/work-orders/week?start=2026-10-19", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("old week code = %d body %s", rec.Code, rec.Body)
	}
	for _, day := range decode[weekView](t, rec).Days {
		for _, item := range day.WorkOrders {
			if item.ID == 9631804 {
				t.Fatal("rescheduled work order remains in old week")
			}
		}
	}
}

func TestRescheduleWorkOrderErrors(t *testing.T) {
	valid := `{"start":"2026-11-03T09:00:00Z","end":"2026-11-03T13:00:00Z"}`
	reversed := `{"start":"2026-11-03T13:00:00Z","end":"2026-11-03T09:00:00Z"}`
	const missing = "invalid work order: schedule start and end are required"
	const conflict = "conflict: only Draft, Published or Routed work orders can be rescheduled"
	for _, tt := range []struct {
		name string
		id   string
		body string
		code int
		err  string
	}{
		{"id not a number", "abc", valid, http.StatusBadRequest, "id must be a number"},
		{"unknown id", "1", valid, http.StatusNotFound, "not found"},
		{"not JSON", "9631804", "not json", http.StatusBadRequest, "invalid JSON body"},
		{"time not RFC 3339", "9631804", `{"start":"tomorrow","end":"2026-11-03T13:00:00Z"}`, http.StatusBadRequest, "invalid JSON body"},
		{"empty body object", "9631804", `{}`, http.StatusBadRequest, missing},
		{"end only", "9631804", `{"end":"2026-11-03T13:00:00Z"}`, http.StatusBadRequest, missing},
		{"start only", "9631804", `{"start":"2026-11-03T09:00:00Z"}`, http.StatusBadRequest, missing},
		{"end before start", "9631804", reversed, http.StatusBadRequest, "invalid work order: schedule end must be after start"},
		{"15 days", "9631804", `{"start":"2026-11-03T09:00:00Z","end":"2026-11-18T09:00:00Z"}`, http.StatusBadRequest, "invalid work order: schedule must not span more than 14 days"},
		{"Assigned", "9631810", valid, http.StatusConflict, conflict},
		{"Work Done", "9631818", valid, http.StatusConflict, conflict},
		{"Approved", "9631821", valid, http.StatusConflict, conflict},
		{"Paid", "9631823", valid, http.StatusConflict, conflict},
		{"Cancelled", "9631825", valid, http.StatusConflict, conflict},
		{"Assigned and bad window", "9631810", reversed, http.StatusConflict, conflict},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s := newTestServer(t)
			path := "/api/work-orders/" + tt.id
			beforeRec := do(t, s, "GET", path, "")
			rec := do(t, s, "POST", path+"/schedule", tt.body)
			if rec.Code != tt.code {
				t.Fatalf("code = %d body %s, want %d", rec.Code, rec.Body, tt.code)
			}
			if got := decode[map[string]string](t, rec); !reflect.DeepEqual(got, map[string]string{"error": tt.err}) {
				t.Errorf("body = %v, want error %q", got, tt.err)
			}
			afterRec := do(t, s, "GET", path, "")
			if beforeRec.Code != afterRec.Code || !reflect.DeepEqual(decode[any](t, beforeRec), decode[any](t, afterRec)) {
				t.Errorf("rejected reschedule changed GET response: before %s, after %s", beforeRec.Body, afterRec.Body)
			}
		})
	}
}
