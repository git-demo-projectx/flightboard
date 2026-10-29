package httpapi

import (
	"encoding/json"
	"maps"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/git-demo-projectx/flightboard/api/internal/store"
	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	st, err := store.NewSeeded()
	if err != nil {
		t.Fatalf("NewSeeded: %v", err)
	}
	return New(st)
}

func do(t *testing.T, s *Server, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	return rec
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return v
}

type woJSON struct {
	ID       int    `json:"id"`
	Status   string `json:"status"`
	Provider *struct {
		Name  string `json:"name"`
		Score int    `json:"score"`
	} `json:"provider"`
	Tasks []struct {
		ID   string `json:"id"`
		Done bool   `json:"done"`
	} `json:"tasks"`
	ExpenseTotals map[string]int `json:"expenseTotals"`
}

func TestHealth(t *testing.T) {
	rec := do(t, newTestServer(t), "GET", "/api/health", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d", rec.Code)
	}
	got := decode[map[string]string](t, rec)
	if got["status"] != "ok" {
		t.Errorf("status = %q, want %q", got["status"], "ok")
	}
	if got["service"] != "flightboard-api" {
		t.Errorf("service = %q, want %q", got["service"], "flightboard-api")
	}
}

func TestListWorkOrders(t *testing.T) {
	s := newTestServer(t)
	for _, tt := range []struct {
		name   string
		query  string
		status string
		count  int
	}{
		{name: "unfiltered", count: 25},
		{name: "empty status", query: "?status=", count: 25},
		{name: "Draft", status: "Draft", count: 3},
		{name: "Published", status: "Published", count: 3},
		{name: "Routed", status: "Routed", count: 3},
		{name: "Assigned", status: "Assigned", count: 8},
		{name: "Work Done", status: "Work Done", count: 3},
		{name: "Approved", status: "Approved", count: 2},
		{name: "Paid", status: "Paid", count: 2},
		{name: "Cancelled", status: "Cancelled", count: 1},
	} {
		t.Run(tt.name, func(t *testing.T) {
			query := tt.query
			if tt.status != "" {
				query = "?status=" + url.QueryEscape(tt.status)
			}
			rec := do(t, s, "GET", "/api/work-orders"+query, "")
			if rec.Code != http.StatusOK {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			list := decode[[]woJSON](t, rec)
			if len(list) != tt.count {
				t.Fatalf("count = %d, want %d", len(list), tt.count)
			}
			for i, w := range list {
				if tt.status != "" && w.Status != tt.status {
					t.Errorf("work order %d status = %q, want %q", w.ID, w.Status, tt.status)
				}
				if tt.status == "" && w.ID != 9631825-i {
					t.Errorf("work order at index %d has id %d, want %d", i, w.ID, 9631825-i)
				}
				if i > 0 && list[i-1].ID <= w.ID {
					t.Errorf("work orders not newest first: %d before %d", list[i-1].ID, w.ID)
				}
			}
		})
	}
}

func TestListWorkOrdersExpandsProvider(t *testing.T) {
	rec := do(t, newTestServer(t), "GET", "/api/work-orders?status=Assigned", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d body %s", rec.Code, rec.Body)
	}
	list := decode[[]woJSON](t, rec)
	if len(list) == 0 {
		t.Fatal("no assigned work orders")
	}
	for _, w := range list {
		if w.Status != "Assigned" {
			t.Errorf("work order %d status %q", w.ID, w.Status)
		}
		if w.Provider == nil || w.Provider.Name == "" {
			t.Errorf("work order %d has no expanded provider", w.ID)
		}
	}
}

func TestListWorkOrdersBadStatus(t *testing.T) {
	rec := do(t, newTestServer(t), "GET", "/api/work-orders?status=Lost", "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("code = %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q", got)
	}
	got := decode[map[string]string](t, rec)
	if got["error"] != `unknown status "Lost"` {
		t.Errorf("error = %q, want %q", got["error"], `unknown status "Lost"`)
	}
}

func TestGetWorkOrder(t *testing.T) {
	s := newTestServer(t)
	if rec := do(t, s, "GET", "/api/work-orders/9631810", ""); rec.Code != http.StatusOK {
		t.Fatalf("code = %d", rec.Code)
	}
	if rec := do(t, s, "GET", "/api/work-orders/1", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("missing id code = %d", rec.Code)
	}
	if rec := do(t, s, "GET", "/api/work-orders/abc", ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad id code = %d", rec.Code)
	}
}

func TestWorkOrderExpenseTotals(t *testing.T) {
	s := newTestServer(t)
	check := func(wantSeed map[string]int) {
		t.Helper()
		rec := do(t, s, "GET", "/api/work-orders", "")
		if rec.Code != http.StatusOK {
			t.Fatalf("list code = %d body %s", rec.Code, rec.Body)
		}
		list := decode[[]woJSON](t, rec)
		if len(list) != 25 {
			t.Fatalf("count = %d, want 25", len(list))
		}
		for _, wo := range list {
			want := map[string]int{"count": 0, "pendingCents": 0, "approvedCents": 0, "rejectedCents": 0}
			if wo.ID == 9631810 {
				want = wantSeed
			}
			if !maps.Equal(wo.ExpenseTotals, want) {
				t.Errorf("list work order %d expenseTotals = %v, want %v", wo.ID, wo.ExpenseTotals, want)
			}
			rec = do(t, s, "GET", "/api/work-orders/"+strconv.Itoa(wo.ID), "")
			if rec.Code != http.StatusOK {
				t.Fatalf("detail code = %d body %s", rec.Code, rec.Body)
			}
			got := decode[woJSON](t, rec)
			if !maps.Equal(got.ExpenseTotals, want) {
				t.Errorf("detail work order %d expenseTotals = %v, want %v", wo.ID, got.ExpenseTotals, want)
			}
		}
	}
	check(map[string]int{"count": 2, "pendingCents": 2400, "approvedCents": 1800, "rejectedCents": 0})
	added, err := s.store.AddExpense(9631810, workorder.Expense{
		Category: workorder.ExpenseTools, Description: "Cable tester rental", AmountCents: 3500,
	})
	if err != nil {
		t.Fatalf("AddExpense: %v", err)
	}
	check(map[string]int{"count": 3, "pendingCents": 5900, "approvedCents": 1800, "rejectedCents": 0})
	if _, err := s.store.SetExpenseStatus(9631810, added.ID, workorder.ExpenseRejected, "Not reimbursable"); err != nil {
		t.Fatalf("SetExpenseStatus: %v", err)
	}
	check(map[string]int{"count": 3, "pendingCents": 2400, "approvedCents": 1800, "rejectedCents": 3500})
	if _, err := s.store.SetExpenseStatus(9631810, "e1", workorder.ExpenseApproved, ""); err != nil {
		t.Fatalf("SetExpenseStatus: %v", err)
	}
	check(map[string]int{"count": 3, "pendingCents": 0, "approvedCents": 4200, "rejectedCents": 3500})
}

func TestWorkOrderExpenses(t *testing.T) {
	for _, tt := range []struct {
		name string
		id   string
		want []workorder.Expense
	}{
		{
			name: "seeded expenses", id: "9631810",
			want: []workorder.Expense{
				{
					ID: "e1", Category: workorder.ExpenseParts, Description: "Replacement patch cables",
					AmountCents: 2400, Status: workorder.ExpensePending,
					CreatedAt: time.Date(2026, 10, 19, 13, 30, 0, 0, time.UTC),
				},
				{
					ID: "e2", Category: workorder.ExpenseMileage, Description: "Travel to the service location",
					AmountCents: 1800, Status: workorder.ExpenseApproved,
					CreatedAt: time.Date(2026, 10, 19, 13, 5, 0, 0, time.UTC),
				},
			},
		},
		{name: "no expenses", id: "9631801", want: []workorder.Expense{}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, newTestServer(t), "GET", "/api/work-orders/"+tt.id+"/expenses", "")
			if rec.Code != http.StatusOK {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			if got := rec.Header().Get("Content-Type"); got != "application/json" {
				t.Errorf("Content-Type = %q", got)
			}
			got := decode[[]workorder.Expense](t, rec)
			if got == nil {
				t.Fatal("expenses must be an array, not null")
			}
			if !slices.EqualFunc(got, tt.want, func(a, b workorder.Expense) bool {
				if !a.CreatedAt.Equal(b.CreatedAt) {
					return false
				}
				a.CreatedAt, b.CreatedAt = time.Time{}, time.Time{}
				return a == b
			}) {
				t.Errorf("expenses = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestWorkOrderExpensesNewestFirst(t *testing.T) {
	s := newTestServer(t)
	added, err := s.store.AddExpense(9631810, workorder.Expense{
		Category: workorder.ExpenseTools, Description: "Cable tester rental", AmountCents: 3500,
	})
	if err != nil {
		t.Fatalf("AddExpense: %v", err)
	}
	before, err := s.store.Expenses(9631810)
	if err != nil {
		t.Fatalf("Expenses: %v", err)
	}
	rec := do(t, s, "GET", "/api/work-orders/9631810/expenses", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d body %s", rec.Code, rec.Body)
	}
	got := decode[[]workorder.Expense](t, rec)
	if len(got) != 3 || got[0].ID != added.ID || got[1].ID != "e1" || got[2].ID != "e2" {
		t.Fatalf("expenses not newest first: %+v", got)
	}
	after, err := s.store.Expenses(9631810)
	if err != nil || !slices.Equal(before, after) {
		t.Errorf("listing changed stored expenses: %+v, err = %v", after, err)
	}
}

func TestWorkOrderExpensesErrors(t *testing.T) {
	for _, tt := range []struct {
		id   string
		code int
		err  string
	}{
		{id: "1", code: http.StatusNotFound, err: "not found"},
		{id: "abc", code: http.StatusBadRequest, err: "id must be a number"},
	} {
		t.Run(tt.id, func(t *testing.T) {
			rec := do(t, newTestServer(t), "GET", "/api/work-orders/"+tt.id+"/expenses", "")
			if rec.Code != tt.code {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			if got := rec.Header().Get("Content-Type"); got != "application/json" {
				t.Errorf("Content-Type = %q", got)
			}
			if got := decode[map[string]string](t, rec); !maps.Equal(got, map[string]string{"error": tt.err}) {
				t.Errorf("error body = %v, want error %q", got, tt.err)
			}
		})
	}
}

func TestWorkOrderProgress(t *testing.T) {
	s := newTestServer(t)
	for _, tt := range []struct {
		name    string
		id      int
		done    int
		total   int
		percent int
		groups  map[workorder.TaskGroup]taskCounts
	}{
		{
			name: "not started", id: 9631801, done: 0, total: 5, percent: 0,
			groups: map[workorder.TaskGroup]taskCounts{
				workorder.TaskPrep: {Done: 0, Total: 1}, workorder.TaskOnSite: {Done: 0, Total: 3},
				workorder.TaskPost: {Done: 0, Total: 1},
			},
		},
		{
			name: "in progress", id: 9631810, done: 2, total: 4, percent: 50,
			groups: map[workorder.TaskGroup]taskCounts{
				workorder.TaskPrep: {Done: 1, Total: 1}, workorder.TaskOnSite: {Done: 1, Total: 2},
				workorder.TaskPost: {Done: 0, Total: 1},
			},
		},
		{
			name: "complete", id: 9631818, done: 4, total: 4, percent: 100,
			groups: map[workorder.TaskGroup]taskCounts{
				workorder.TaskPrep: {Done: 1, Total: 1}, workorder.TaskOnSite: {Done: 2, Total: 2},
				workorder.TaskPost: {Done: 1, Total: 1},
			},
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, s, "GET", "/api/work-orders/"+strconv.Itoa(tt.id)+"/progress", "")
			if rec.Code != http.StatusOK {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			if got := rec.Header().Get("Content-Type"); got != "application/json" {
				t.Errorf("Content-Type = %q", got)
			}
			got := decode[taskProgress](t, rec)
			if got.Done != tt.done || got.Total != tt.total || got.Percent != tt.percent {
				t.Errorf("progress = %+v, want done %d total %d percent %d", got, tt.done, tt.total, tt.percent)
			}
			if !maps.Equal(got.Groups, tt.groups) {
				t.Errorf("groups = %v, want %v", got.Groups, tt.groups)
			}
		})
	}
}

func TestWorkOrderProgressErrors(t *testing.T) {
	for _, tt := range []struct {
		id   string
		code int
		err  string
	}{
		{id: "1", code: http.StatusNotFound, err: "not found"},
		{id: "abc", code: http.StatusBadRequest, err: "id must be a number"},
	} {
		t.Run(tt.id, func(t *testing.T) {
			rec := do(t, newTestServer(t), "GET", "/api/work-orders/"+tt.id+"/progress", "")
			if rec.Code != tt.code {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			if got := rec.Header().Get("Content-Type"); got != "application/json" {
				t.Errorf("Content-Type = %q", got)
			}
			if got := decode[map[string]string](t, rec); !maps.Equal(got, map[string]string{"error": tt.err}) {
				t.Errorf("error body = %v, want error %q", got, tt.err)
			}
		})
	}
}

func TestWorkOrderProgressAfterTaskUpdate(t *testing.T) {
	s := newTestServer(t)
	body := `{"title":"Task progress","status":"Draft","tasks":[
		{"id":"a","group":"On Site","done":true},
		{"id":"b","group":"On Site","done":false},
		{"id":"c","group":"On Site","done":false}]}`
	rec := do(t, s, "POST", "/api/work-orders", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create code = %d body %s", rec.Code, rec.Body)
	}
	path := "/api/work-orders/" + strconv.Itoa(decode[woJSON](t, rec).ID)
	for _, tt := range []struct {
		done    bool
		count   int
		percent int
	}{
		{done: true, count: 2, percent: 66},
		{done: true, count: 2, percent: 66},
		{done: false, count: 1, percent: 33},
	} {
		rec = do(t, s, "PATCH", path+"/tasks/b", `{"done":`+strconv.FormatBool(tt.done)+`}`)
		if rec.Code != http.StatusOK {
			t.Fatalf("update code = %d body %s", rec.Code, rec.Body)
		}
		rec = do(t, s, "GET", path+"/progress", "")
		if rec.Code != http.StatusOK {
			t.Fatalf("progress code = %d body %s", rec.Code, rec.Body)
		}
		got := decode[taskProgress](t, rec)
		if got.Done != tt.count || got.Total != 3 || got.Percent != tt.percent {
			t.Errorf("progress = %+v, want done %d total 3 percent %d", got, tt.count, tt.percent)
		}
		wantGroups := map[workorder.TaskGroup]taskCounts{
			workorder.TaskPrep: {}, workorder.TaskOnSite: {Done: tt.count, Total: 3}, workorder.TaskPost: {},
		}
		if !maps.Equal(got.Groups, wantGroups) {
			t.Errorf("groups = %v, want %v", got.Groups, wantGroups)
		}
	}
}

func TestProgressForNoTasks(t *testing.T) {
	got := progressForTasks(nil)
	if got.Done != 0 || got.Total != 0 || got.Percent != 0 {
		t.Errorf("progress = %+v, want zero counts and percent", got)
	}
	wantGroups := map[workorder.TaskGroup]taskCounts{
		workorder.TaskPrep: {}, workorder.TaskOnSite: {}, workorder.TaskPost: {},
	}
	if !maps.Equal(got.Groups, wantGroups) {
		t.Errorf("groups = %v, want %v", got.Groups, wantGroups)
	}
}

func TestWorkOrderSummary(t *testing.T) {
	for _, tt := range []struct {
		name            string
		server          *Server
		total           int
		byStatus        map[string]int
		pendingExpenses int
	}{
		{
			name: "seeded", server: newTestServer(t), total: 25, pendingExpenses: 1,
			byStatus: map[string]int{
				"Draft": 3, "Published": 3, "Routed": 3, "Assigned": 8,
				"Work Done": 3, "Approved": 2, "Paid": 2, "Cancelled": 1,
			},
		},
		{
			name: "empty", server: New(store.New()), total: 0,
			byStatus: map[string]int{
				"Draft": 0, "Published": 0, "Routed": 0, "Assigned": 0,
				"Work Done": 0, "Approved": 0, "Paid": 0, "Cancelled": 0,
			},
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, tt.server, "GET", "/api/work-orders/summary", "")
			if rec.Code != http.StatusOK {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			if got := rec.Header().Get("Content-Type"); got != "application/json" {
				t.Errorf("Content-Type = %q", got)
			}
			got := decode[struct {
				Total           int            `json:"total"`
				ByStatus        map[string]int `json:"byStatus"`
				PendingExpenses *int           `json:"pendingExpenses"`
			}](t, rec)
			if got.Total != tt.total {
				t.Errorf("total = %d, want %d", got.Total, tt.total)
			}
			if !maps.Equal(got.ByStatus, tt.byStatus) {
				t.Errorf("byStatus = %v, want %v", got.ByStatus, tt.byStatus)
			}
			if got.PendingExpenses == nil || *got.PendingExpenses != tt.pendingExpenses {
				t.Errorf("summary = %s, want pendingExpenses %d", rec.Body, tt.pendingExpenses)
			}
		})
	}
}

func TestWorkOrderSummaryCountsPendingWorkOrders(t *testing.T) {
	s := newTestServer(t)
	for _, tt := range []struct {
		id   int
		want int
	}{
		{id: 9631810, want: 1},
		{id: 9631811, want: 2},
	} {
		added, err := s.store.AddExpense(tt.id, workorder.Expense{
			Category: workorder.ExpenseOther, Description: "Parking", AmountCents: 500,
		})
		if err != nil {
			t.Fatalf("AddExpense: %v", err)
		}
		for _, status := range []workorder.ExpenseStatus{workorder.ExpensePending, workorder.ExpenseApproved, workorder.ExpenseRejected} {
			if _, err := s.store.SetExpenseStatus(tt.id, added.ID, status, ""); err != nil {
				t.Fatalf("SetExpenseStatus: %v", err)
			}
			rec := do(t, s, "GET", "/api/work-orders/summary", "")
			if rec.Code != http.StatusOK {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			got := decode[map[string]json.RawMessage](t, rec)
			want := tt.want
			if tt.id == 9631811 && status != workorder.ExpensePending {
				want = 1
			}
			if string(got["pendingExpenses"]) != strconv.Itoa(want) {
				t.Errorf("work order %d expense status %s: pendingExpenses = %s, want %d", tt.id, status, got["pendingExpenses"], want)
			}
		}
	}
}

func TestGetEverySeededWorkOrder(t *testing.T) {
	s := newTestServer(t)
	for _, wo := range s.store.ListWorkOrders(store.Filter{}) {
		t.Run(strconv.Itoa(wo.ID), func(t *testing.T) {
			rec := do(t, s, "GET", "/api/work-orders/"+strconv.Itoa(wo.ID), "")
			if rec.Code != http.StatusOK {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			if got := decode[woJSON](t, rec); got.ID != wo.ID || got.Status != string(wo.Status) {
				t.Errorf("got work order %+v, want id %d status %q", got, wo.ID, wo.Status)
			}
		})
	}
}

func TestCreateWorkOrder(t *testing.T) {
	s := newTestServer(t)
	body := `{"title":"Install AP","typeOfWork":"Networking","status":"Published","buyer":"Northwind Retail",
		"location":{"city":"Fargo","state":"ND"},
		"schedule":{"start":"2026-10-23T09:00:00Z","end":"2026-10-23T13:00:00Z"},
		"pay":{"type":"Hourly","rate":65,"hours":4}}`
	rec := do(t, s, "POST", "/api/work-orders", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("code = %d body %s", rec.Code, rec.Body)
	}
	created := decode[woJSON](t, rec)
	if created.Status != "Published" || len(created.Tasks) == 0 {
		t.Fatalf("unexpected created work order %+v", created)
	}

	rec = do(t, s, "POST", "/api/work-orders", `{"title":"No pay","status":"Published"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid publish code = %d", rec.Code)
	}
	rec = do(t, s, "POST", "/api/work-orders", `{not json`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("bad json code = %d", rec.Code)
	}
}

func TestSetStatus(t *testing.T) {
	s := newTestServer(t)
	rec := do(t, s, "POST", "/api/work-orders/9631819/status", `{"status":"Approved"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d body %s", rec.Code, rec.Body)
	}
	if got := decode[woJSON](t, rec).Status; got != "Approved" {
		t.Fatalf("status = %q", got)
	}
	rec = do(t, s, "POST", "/api/work-orders/9631801/status", `{"status":"Paid"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("illegal transition code = %d", rec.Code)
	}
}

func TestApproveWithExpenses(t *testing.T) {
	for _, decision := range []workorder.ExpenseStatus{workorder.ExpensePending, workorder.ExpenseApproved, workorder.ExpenseRejected} {
		t.Run(string(decision), func(t *testing.T) {
			s := newTestServer(t)
			e, err := s.store.AddExpense(9631819, workorder.Expense{
				Category: workorder.ExpenseParts, Description: "Patch cable", AmountCents: 1000,
			})
			if err != nil {
				t.Fatal(err)
			}
			if _, err := s.store.SetExpenseStatus(9631819, e.ID, decision, "Not covered"); err != nil {
				t.Fatal(err)
			}
			rec := do(t, s, "POST", "/api/work-orders/9631819/status", `{"status":"Approved"}`)
			wantStatus := "Approved"
			if decision == workorder.ExpensePending {
				if rec.Code != http.StatusConflict {
					t.Fatalf("code = %d body %s", rec.Code, rec.Body)
				}
				want := map[string]string{"error": "approve or reject the pending expenses first"}
				if got := decode[map[string]string](t, rec); !maps.Equal(got, want) {
					t.Fatalf("response = %v, want %v", got, want)
				}
				wantStatus = "Work Done"
			} else {
				if rec.Code != http.StatusOK {
					t.Fatalf("code = %d body %s", rec.Code, rec.Body)
				}
				if got := decode[woJSON](t, rec).Status; got != wantStatus {
					t.Fatalf("response status = %q, want %q", got, wantStatus)
				}
			}
			rec = do(t, s, "GET", "/api/work-orders/9631819", "")
			if rec.Code != http.StatusOK {
				t.Fatalf("get code = %d body %s", rec.Code, rec.Body)
			}
			if got := decode[woJSON](t, rec).Status; got != wantStatus {
				t.Fatalf("stored status = %q, want %q", got, wantStatus)
			}
		})
	}
}

func TestCheckInOut(t *testing.T) {
	s := newTestServer(t)
	rec := do(t, s, "POST", "/api/work-orders/9631812/check-in", `{"time":"2026-10-20T09:02:00Z"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("check-in code = %d body %s", rec.Code, rec.Body)
	}
	rec = do(t, s, "POST", "/api/work-orders/9631812/check-out", `{}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("check-out code = %d body %s", rec.Code, rec.Body)
	}
	rec = do(t, s, "POST", "/api/work-orders/9631801/check-in", `{}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("draft check-in code = %d", rec.Code)
	}
}

func TestUpdateTask(t *testing.T) {
	s := newTestServer(t)
	rec := do(t, s, "PATCH", "/api/work-orders/9631801/tasks/t1", `{"done":true}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d body %s", rec.Code, rec.Body)
	}
	if !decode[woJSON](t, rec).Tasks[0].Done {
		t.Fatal("task not marked done")
	}
	if rec := do(t, s, "PATCH", "/api/work-orders/9631801/tasks/zz", `{"done":true}`); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown task code = %d", rec.Code)
	}
}

func TestProviders(t *testing.T) {
	s := newTestServer(t)
	rec := do(t, s, "GET", "/api/providers", "")
	list := decode[[]struct {
		ID    string `json:"id"`
		Score int    `json:"score"`
	}](t, rec)
	if len(list) == 0 {
		t.Fatal("no providers")
	}
	for i := 1; i < len(list); i++ {
		if list[i-1].Score < list[i].Score {
			t.Fatal("providers not sorted by score")
		}
	}
	if rec := do(t, s, "GET", "/api/providers/"+list[0].ID, ""); rec.Code != http.StatusOK {
		t.Fatalf("get provider code = %d", rec.Code)
	}
	if rec := do(t, s, "GET", "/api/providers/nope", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("missing provider code = %d", rec.Code)
	}
}
