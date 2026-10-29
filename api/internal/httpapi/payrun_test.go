package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/git-demo-projectx/flightboard/api/internal/store"
	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

func TestPayRunSizeLimits(t *testing.T) {
	for _, count := range []int{1, 50} {
		t.Run(strconv.Itoa(count), func(t *testing.T) {
			st := store.New()
			ids := make([]int, 0, count)
			for i := 0; i < count; i++ {
				w, err := st.CreateWorkOrder(workorder.WorkOrder{Title: "Pay run", Status: workorder.StatusDraft})
				if err != nil {
					t.Fatal(err)
				}
				for _, status := range []workorder.Status{workorder.StatusPublished, workorder.StatusAssigned, workorder.StatusWorkDone, workorder.StatusApproved} {
					if _, err := st.SetStatus(w.ID, status); err != nil {
						t.Fatal(err)
					}
				}
				ids = append(ids, w.ID)
			}
			body, err := json.Marshal(map[string][]int{"ids": ids})
			if err != nil {
				t.Fatal(err)
			}
			rec := do(t, New(st), "POST", "/api/work-orders/pay-run", string(body))
			if rec.Code != http.StatusOK {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			got := decode[payRunView](t, rec)
			if got.Count != count || len(got.WorkOrders) != count {
				t.Fatalf("response = %+v, want %d work orders", got, count)
			}
		})
	}
}

func TestPayRun(t *testing.T) {
	for _, ids := range [][]int{{9631821, 9631822}, {9631822, 9631821}} {
		t.Run(fmt.Sprint(ids), func(t *testing.T) {
			s := newTestServer(t)
			body, err := json.Marshal(map[string][]int{"ids": ids})
			if err != nil {
				t.Fatal(err)
			}
			before := time.Now().UTC().Truncate(time.Second)
			rec := do(t, s, "POST", "/api/work-orders/pay-run", string(body))
			after := time.Now().UTC()
			if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != "application/json" {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			got := decode[payRunView](t, rec)
			if got.Count != 2 || len(got.WorkOrders) != 2 {
				t.Fatalf("response = %+v, want two work orders", got)
			}
			raw := decode[map[string]json.RawMessage](t, rec)
			if string(raw["paidAt"]) != strconv.Quote(got.PaidAt.Format(time.RFC3339)) || got.PaidAt.Location() != time.UTC || got.PaidAt.Nanosecond() != 0 || got.PaidAt.Before(before) || got.PaidAt.After(after) {
				t.Fatalf("paidAt = %s, want server time in UTC with whole seconds", raw["paidAt"])
			}
			titles := map[int]string{9631821: "Receipt printer replacement", 9631822: "Desk phone moves, 12 seats"}
			items := decode[struct {
				WorkOrders []map[string]json.RawMessage `json:"workOrders"`
			}](t, rec).WorkOrders
			for i, w := range got.WorkOrders {
				if w.ID != ids[i] || w.Title != titles[ids[i]] || w.Status != workorder.StatusPaid || !w.PaidAt.Equal(got.PaidAt) || len(items[i]) != 4 {
					t.Errorf("item %d = %+v, want id %d Paid at %v", i, w, ids[i], got.PaidAt)
				}
				rec = do(t, s, "GET", "/api/work-orders/"+strconv.Itoa(ids[i]), "")
				if rec.Code != http.StatusOK {
					t.Fatalf("get code = %d body %s", rec.Code, rec.Body)
				}
				stored := decode[payRunItem](t, rec)
				if stored != w {
					t.Errorf("detail = %+v, want %+v", stored, w)
				}
			}
			rec = do(t, s, "GET", "/api/work-orders/summary", "")
			if rec.Code != http.StatusOK {
				t.Fatalf("summary code = %d body %s", rec.Code, rec.Body)
			}
			summary := decode[struct {
				ByStatus map[string]int `json:"byStatus"`
			}](t, rec)
			if summary.ByStatus["Approved"] != 0 || summary.ByStatus["Paid"] != 4 {
				t.Errorf("summary byStatus = %v", summary.ByStatus)
			}
			rec = do(t, s, "GET", "/api/work-orders?status=Paid", "")
			if rec.Code != http.StatusOK {
				t.Fatalf("list code = %d body %s", rec.Code, rec.Body)
			}
			for _, w := range decode[[]payRunItem](t, rec) {
				if _, paid := titles[w.ID]; paid && !w.PaidAt.Equal(got.PaidAt) {
					t.Errorf("list work order %d paidAt = %v, want %v", w.ID, w.PaidAt, got.PaidAt)
				}
			}
			rec = do(t, s, "POST", "/api/work-orders/pay-run", `{"ids":[9631821]}`)
			if rec.Code != http.StatusConflict || rec.Body.String() != "{\"error\":\"conflict: work order 9631821 is Paid, not Approved\"}\n" {
				t.Fatalf("repeat run code = %d body %s", rec.Code, rec.Body)
			}
		})
	}
}

func TestPayRunErrors(t *testing.T) {
	tooMany := make([]int, 51)
	for i := range tooMany {
		tooMany[i] = 9631821 + i
	}
	largeBody, err := json.Marshal(map[string][]int{"ids": tooMany})
	if err != nil {
		t.Fatal(err)
	}
	for _, tt := range []struct {
		name string
		body string
		code int
		msg  string
	}{
		{"empty", `{"ids":[]}`, 400, "ids must list 1 to 50 work orders"},
		{"missing", `{}`, 400, "ids must list 1 to 50 work orders"},
		{"too many", string(largeBody), 400, "ids must list 1 to 50 work orders"},
		{"duplicate", `{"ids":[9631821,9631821]}`, 400, "duplicate work order 9631821"},
		{"unknown id", `{"ids":[9631821,9999999]}`, 404, "not found: work order 9999999"},
		{"not approved", `{"ids":[9631821,9631818]}`, 409, "conflict: work order 9631818 is Work Done, not Approved"},
		{"wrong type", `{"ids":"9631821"}`, 400, "invalid JSON body"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s := newTestServer(t)
			rec := do(t, s, "POST", "/api/work-orders/pay-run", tt.body)
			want := "{\"error\":" + strconv.Quote(tt.msg) + "}\n"
			if rec.Code != tt.code || rec.Body.String() != want {
				t.Fatalf("code = %d body %q, want %d %q", rec.Code, rec.Body.String(), tt.code, want)
			}
			for _, id := range []int{9631821, 9631822} {
				w, err := s.store.GetWorkOrder(id)
				if err != nil || w.Status != workorder.StatusApproved || !w.PaidAt.IsZero() {
					t.Errorf("failed pay run changed work order %d: %+v, err = %v", id, w, err)
				}
			}
		})
	}
}

func TestPaidAtIsServerOwned(t *testing.T) {
	s := newTestServer(t)
	for _, id := range []int{9631810, 9631823} {
		rec := do(t, s, "GET", "/api/work-orders/"+strconv.Itoa(id), "")
		if rec.Code != http.StatusOK || strings.Contains(rec.Body.String(), "paidAt") {
			t.Fatalf("work order without pay run code = %d body %s", rec.Code, rec.Body)
		}
	}
	rec := do(t, s, "POST", "/api/work-orders", `{"title":"New draft","status":"Draft","paidAt":"2026-01-01T00:00:00Z"}`)
	if rec.Code != http.StatusCreated || strings.Contains(rec.Body.String(), "paidAt") {
		t.Fatalf("create code = %d body %s", rec.Code, rec.Body)
	}
	id := decode[woJSON](t, rec).ID
	rec = do(t, s, "GET", "/api/work-orders/"+strconv.Itoa(id), "")
	if rec.Code != http.StatusOK || strings.Contains(rec.Body.String(), "paidAt") {
		t.Fatalf("created detail code = %d body %s", rec.Code, rec.Body)
	}
	rec = do(t, s, "POST", "/api/work-orders/9631821/status", `{"status":"Paid"}`)
	if rec.Code != http.StatusOK || decode[woJSON](t, rec).Status != "Paid" || strings.Contains(rec.Body.String(), "paidAt") {
		t.Fatalf("single status route code = %d body %s", rec.Code, rec.Body)
	}
}
