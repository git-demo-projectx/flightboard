package httpapi

import (
	"encoding/json"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

func TestCreateExpense(t *testing.T) {
	s := newTestServer(t)
	before := time.Now()
	rec := do(t, s, "POST", "/api/work-orders/9631810/expenses", `{"category":"Tools","description":"Cable tester rental","amountCents":3500}`)
	after := time.Now()
	if rec.Code != http.StatusCreated {
		t.Fatalf("code = %d body %s", rec.Code, rec.Body)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q", got)
	}
	expense := decode[workorder.Expense](t, rec)
	if expense.ID != "e3" || expense.Status != workorder.ExpensePending || expense.Category != workorder.ExpenseTools || expense.Description != "Cable tester rental" || expense.AmountCents != 3500 {
		t.Errorf("expense = %+v", expense)
	}
	if _, exists := decode[map[string]json.RawMessage](t, rec)["reason"]; exists {
		t.Errorf("response must omit reason: %s", rec.Body)
	}
	if expense.CreatedAt.Before(before) || expense.CreatedAt.After(after) {
		t.Errorf("createdAt = %v, want between %v and %v", expense.CreatedAt, before, after)
	}
	rec = do(t, s, "GET", "/api/work-orders/9631810/expenses", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("list code = %d body %s", rec.Code, rec.Body)
	}
	expenses := decode[[]workorder.Expense](t, rec)
	if len(expenses) != 3 || expenses[0] != expense {
		t.Errorf("expenses = %+v, want new expense first", expenses)
	}
	rec = do(t, s, "GET", "/api/work-orders/9631810", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("detail code = %d body %s", rec.Code, rec.Body)
	}
	totals := decode[woJSON](t, rec).ExpenseTotals
	if totals["pendingCents"] != 5900 || totals["count"] != 3 {
		t.Errorf("expenseTotals = %v, want pendingCents 5900 and count 3", totals)
	}
}

func TestCreateExpenseIgnoresServerFields(t *testing.T) {
	rec := do(t, newTestServer(t), "POST", "/api/work-orders/9631810/expenses", `{"category":"Tools","description":"Cable tester rental","amountCents":3500,"id":"x9","status":"Approved","reason":"pre-approved","createdAt":"2020-01-01T00:00:00Z"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("code = %d body %s", rec.Code, rec.Body)
	}
	expense := decode[workorder.Expense](t, rec)
	if expense.ID != "e3" || expense.Status != workorder.ExpensePending || !expense.CreatedAt.After(time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("server fields = %+v", expense)
	}
	if _, exists := decode[map[string]json.RawMessage](t, rec)["reason"]; exists {
		t.Errorf("response must omit reason: %s", rec.Body)
	}
}

func TestCreateExpenseValidation(t *testing.T) {
	for _, tt := range []struct {
		name string
		body string
		msg  string
	}{
		{"unknown category", `{"category":"Meals","description":"Patch cable","amountCents":100}`, `invalid work order: unknown expense category "Meals"`},
		{"missing category", `{"description":"Patch cable","amountCents":100}`, `invalid work order: unknown expense category ""`},
		{"blank description", `{"category":"Parts","description":"  ","amountCents":100}`, "invalid work order: expense description is required"},
		{"201 characters", `{"category":"Parts","description":"` + strings.Repeat("a", 201) + `","amountCents":100}`, "invalid work order: expense description must not exceed 200 characters"},
		{"zero amount", `{"category":"Parts","description":"Patch cable","amountCents":0}`, "invalid work order: expense amount must be between 1 and 500000 cents"},
		{"over maximum", `{"category":"Parts","description":"Patch cable","amountCents":500001}`, "invalid work order: expense amount must be between 1 and 500000 cents"},
		{"fractional amount", `{"category":"Parts","description":"Patch cable","amountCents":12.5}`, "invalid JSON body"},
		{"string amount", `{"category":"Parts","description":"Patch cable","amountCents":"100"}`, "invalid JSON body"},
		{"not JSON", "not json", "invalid JSON body"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s := newTestServer(t)
			before, err := s.store.Expenses(9631810)
			if err != nil {
				t.Fatal(err)
			}
			rec := do(t, s, "POST", "/api/work-orders/9631810/expenses", tt.body)
			if rec.Code != http.StatusBadRequest || decode[map[string]string](t, rec)["error"] != tt.msg {
				t.Fatalf("code = %d body %s, want 400 error %q", rec.Code, rec.Body, tt.msg)
			}
			after, err := s.store.Expenses(9631810)
			if err != nil || len(after) != 2 || !slices.Equal(before, after) {
				t.Errorf("invalid expense changed store: %+v, err = %v", after, err)
			}
		})
	}
}

func TestCreateExpenseErrors(t *testing.T) {
	for _, tt := range []struct {
		name string
		id   string
		code int
		msg  string
	}{
		{"non-numeric id", "abc", 400, "id must be a number"},
		{"unknown id", "1", 404, "not found"},
		{"Draft", "9631801", 409, "conflict: expenses can change only while the work order is Assigned or Work Done"},
		{"Paid", "9631823", 409, "conflict: expenses can change only while the work order is Assigned or Work Done"},
		{"Work Done", "9631818", 201, ""},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s := newTestServer(t)
			rec := do(t, s, "POST", "/api/work-orders/"+tt.id+"/expenses", `{"category":"Parts","description":"Patch cable","amountCents":100}`)
			if rec.Code != tt.code {
				t.Fatalf("code = %d body %s, want %d", rec.Code, rec.Body, tt.code)
			}
			if tt.msg != "" && decode[map[string]string](t, rec)["error"] != tt.msg {
				t.Errorf("body = %s, want error %q", rec.Body, tt.msg)
			}
			if tt.code == http.StatusConflict {
				id, err := strconv.Atoi(tt.id)
				if err != nil {
					t.Fatal(err)
				}
				expenses, err := s.store.Expenses(id)
				if err != nil || len(expenses) != 0 {
					t.Errorf("closed work order expenses = %+v, err = %v", expenses, err)
				}
			}
		})
	}
}
