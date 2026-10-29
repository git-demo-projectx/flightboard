package httpapi

import (
	"encoding/json"
	"net/http"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

func TestWorkOrderWeek(t *testing.T) {
	s := newTestServer(t)
	for _, tt := range []struct {
		name       string
		query      string
		start      string
		end        string
		total      int
		unassigned int
		dayTotals  []int
		ids        []int
	}{
		{"seed week", "start=2026-10-19", "2026-10-19", "2026-10-25", 14, 6, []int{4, 2, 2, 3, 2, 1, 0}, nil},
		{"next week", "start=2026-10-26", "2026-10-26", "2026-11-01", 3, 3, nil, []int{9631801, 9631802, 9631803}},
		{"Wednesday", "start=2026-10-21", "2026-10-21", "2026-10-27", 10, 8, nil, nil},
		{"unknown provider", "start=2026-10-19&providerId=p-999", "2026-10-19", "2026-10-25", 0, 0, []int{0, 0, 0, 0, 0, 0, 0}, []int{}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, s, "GET", "/api/work-orders/week?"+tt.query, "")
			if rec.Code != http.StatusOK {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			got := decode[weekView](t, rec)
			if got.Start != tt.start || got.End != tt.end || got.Total != tt.total || got.Unassigned != tt.unassigned {
				t.Errorf("week = %+v, want dates %s to %s, total %d, unassigned %d", got, tt.start, tt.end, tt.total, tt.unassigned)
			}
			if len(got.Days) != 7 {
				t.Fatalf("days = %d, want 7", len(got.Days))
			}
			dayTotals, ids := make([]int, 0, 7), make([]int, 0)
			start, err := time.Parse(time.DateOnly, tt.start)
			if err != nil {
				t.Fatal(err)
			}
			for i, day := range got.Days {
				if day.Date != start.AddDate(0, 0, i).Format(time.DateOnly) || day.WorkOrders == nil || day.Total != len(day.WorkOrders) {
					t.Errorf("invalid day %d: %+v", i, day)
				}
				dayTotals = append(dayTotals, day.Total)
				unassigned := 0
				for _, item := range day.WorkOrders {
					ids = append(ids, item.ID)
					if item.Provider == nil {
						unassigned++
					}
				}
				if day.Unassigned != unassigned {
					t.Errorf("day %s unassigned = %d, want %d", day.Date, day.Unassigned, unassigned)
				}
			}
			if tt.dayTotals != nil && !slices.Equal(dayTotals, tt.dayTotals) {
				t.Errorf("day totals = %v, want %v", dayTotals, tt.dayTotals)
			}
			if tt.ids != nil && !slices.Equal(ids, tt.ids) {
				t.Errorf("ids = %v, want %v", ids, tt.ids)
			}
			if tt.name == "seed week" {
				mondayIDs := make([]int, 0)
				for _, item := range got.Days[0].WorkOrders {
					mondayIDs = append(mondayIDs, item.ID)
				}
				if want := []int{9631814, 9631815, 9631810, 9631811}; !slices.Equal(mondayIDs, want) {
					t.Errorf("Monday ids = %v, want %v", mondayIDs, want)
				}
				if !strings.Contains(rec.Body.String(), `{"date":"2026-10-25","total":0,"unassigned":0,"workOrders":[]}`) {
					t.Errorf("empty Sunday missing from body: %s", rec.Body)
				}
			}
		})
	}
}

func TestWorkOrderWeekBadStart(t *testing.T) {
	for _, query := range []string{"", "?start=", "?start=2026-13-01", "?start=10/19/2026"} {
		t.Run(query, func(t *testing.T) {
			rec := do(t, newTestServer(t), "GET", "/api/work-orders/week"+query, "")
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			want := map[string]string{"error": "start must be a date like 2026-10-19"}
			if got := decode[map[string]string](t, rec); !reflect.DeepEqual(got, want) {
				t.Errorf("body = %v, want %v", got, want)
			}
		})
	}
}

func TestBuildWeek(t *testing.T) {
	parse := func(layout, value string) time.Time {
		t.Helper()
		v, err := time.Parse(layout, value)
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	start := parse(time.DateOnly, "2026-10-19")
	late := parse(time.RFC3339, "2026-10-25T23:30:00-05:00")
	end := late.Add(time.Hour)
	schedule := &workorder.Schedule{Start: late, End: end}
	list := []workorder.WorkOrder{
		{ID: 5, Status: workorder.StatusAssigned, ProviderID: "known", Schedule: schedule},
		{ID: 4, Status: workorder.StatusPublished, ProviderID: "unknown", Schedule: schedule},
		{ID: 3, Status: workorder.StatusPublished, Schedule: schedule},
		{ID: 2, Status: workorder.StatusCancelled, Schedule: schedule},
		{ID: 1, Status: workorder.StatusDraft},
		{ID: 6, Status: workorder.StatusPublished, Schedule: &workorder.Schedule{Start: late.AddDate(0, 0, 1)}},
		{ID: 7, Status: workorder.StatusPublished, Schedule: &workorder.Schedule{Start: start.AddDate(0, 0, -1)}},
	}
	providers := map[string]workorder.Provider{
		"known": {ID: "known", Name: "Test Provider"},
		"":      {ID: "empty", Name: "Should not resolve"},
	}
	got := buildWeek(start, list, providers)
	if got.Total != 3 || got.Unassigned != 2 || len(got.Days) != 7 {
		t.Fatalf("week = %+v, want total 3, unassigned 2, seven days", got)
	}
	for _, day := range got.Days[:6] {
		if day.Total != 0 || day.Unassigned != 0 || day.WorkOrders == nil || len(day.WorkOrders) != 0 {
			t.Errorf("day should be empty: %+v", day)
		}
	}
	sunday := got.Days[6]
	if sunday.Date != "2026-10-25" || sunday.Total != 3 || sunday.Unassigned != 2 {
		t.Errorf("Sunday = %+v", sunday)
	}
	if len(sunday.WorkOrders) != 3 {
		t.Fatalf("Sunday items = %d, want 3", len(sunday.WorkOrders))
	}
	for i, item := range sunday.WorkOrders {
		if item.ID != i+3 || !item.Start.Equal(late) || !item.End.Equal(end) {
			t.Errorf("Sunday item %d = %+v", i, item)
		}
		if i < 2 && item.Provider != nil {
			t.Errorf("unassigned item %d provider = %+v", item.ID, item.Provider)
		}
	}
	if want := (&weekProvider{ID: "known", Name: "Test Provider"}); !reflect.DeepEqual(sunday.WorkOrders[2].Provider, want) {
		t.Errorf("known provider = %+v, want %+v", sunday.WorkOrders[2].Provider, want)
	}
	data, err := json.Marshal(sunday.WorkOrders[0])
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), `"provider":null`) || strings.Contains(string(data), `"subStatus"`) {
		t.Errorf("item should have null provider and omitted subStatus: %s", data)
	}
}

func TestWorkOrderWeekProvider(t *testing.T) {
	rec := do(t, newTestServer(t), "GET", "/api/work-orders/week?start=2026-10-19&providerId=p-101", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d body %s", rec.Code, rec.Body)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q", got)
	}
	wantJSON := `{
  "start":"2026-10-19","end":"2026-10-25","total":2,"unassigned":0,
  "days":[
    {"date":"2026-10-19","total":1,"unassigned":0,"workOrders":[{
      "id":9631810,"title":"Replace failed switch in IDF closet",
      "status":"Assigned","subStatus":"Checked In","health":"On Track",
      "start":"2026-10-19T08:00:00-05:00","end":"2026-10-19T12:00:00-05:00",
      "location":{"city":"Minneapolis","state":"MN"},
      "provider":{"id":"p-101","name":"Dana Whitfield"}
    }]},
    {"date":"2026-10-20","total":0,"unassigned":0,"workOrders":[]},
    {"date":"2026-10-21","total":0,"unassigned":0,"workOrders":[]},
    {"date":"2026-10-22","total":1,"unassigned":0,"workOrders":[{
      "id":9631817,"title":"Laptop imaging for new hires",
      "status":"Assigned","subStatus":"Start Time Set","health":"On Track",
      "start":"2026-10-22T09:00:00-05:00","end":"2026-10-22T14:00:00-05:00",
      "location":{"city":"Edina","state":"MN"},
      "provider":{"id":"p-101","name":"Dana Whitfield"}
    }]},
    {"date":"2026-10-23","total":0,"unassigned":0,"workOrders":[]},
    {"date":"2026-10-24","total":0,"unassigned":0,"workOrders":[]},
    {"date":"2026-10-25","total":0,"unassigned":0,"workOrders":[]}
  ]
}`
	var want any
	if err := json.Unmarshal([]byte(wantJSON), &want); err != nil {
		t.Fatal(err)
	}
	if got := decode[any](t, rec); !reflect.DeepEqual(got, want) {
		t.Errorf("response = %s, want %s", rec.Body, wantJSON)
	}
}
