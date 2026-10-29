package workorder

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestAcceptsExpenses(t *testing.T) {
	for _, status := range Statuses {
		t.Run(string(status), func(t *testing.T) {
			w := WorkOrder{Status: status}
			want := status == StatusAssigned || status == StatusWorkDone
			if got := w.AcceptsExpenses(); got != want {
				t.Errorf("AcceptsExpenses(%s) = %v, want %v", status, got, want)
			}
		})
	}
}

func TestValidateExpense(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*Expense)
		wantErr bool
	}{
		{"valid", func(*Expense) {}, false},
		{"mileage", func(e *Expense) { e.Category = ExpenseMileage }, false},
		{"tools", func(e *Expense) { e.Category = ExpenseTools }, false},
		{"other", func(e *Expense) { e.Category = ExpenseOther }, false},
		{"unknown category", func(e *Expense) { e.Category = "Meals" }, true},
		{"empty description", func(e *Expense) { e.Description = "" }, true},
		{"blank description", func(e *Expense) { e.Description = " \t" }, true},
		{"long description", func(e *Expense) { e.Description = strings.Repeat("a", 201) }, true},
		{"200 characters", func(e *Expense) { e.Description = strings.Repeat("a", 200) }, false},
		{"200 multibyte characters", func(e *Expense) { e.Description = strings.Repeat("\u00e9", 200) }, false},
		{"201 multibyte characters", func(e *Expense) { e.Description = strings.Repeat("\u00e9", 201) }, true},
		{"zero amount", func(e *Expense) { e.AmountCents = 0 }, true},
		{"negative amount", func(e *Expense) { e.AmountCents = -1 }, true},
		{"over maximum", func(e *Expense) { e.AmountCents = 500001 }, true},
		{"minimum amount", func(e *Expense) { e.AmountCents = 1 }, false},
		{"maximum amount", func(e *Expense) { e.AmountCents = 500000 }, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := Expense{Category: ExpenseParts, Description: "Patch cable", AmountCents: 1000}
			tt.mutate(&e)
			err := ValidateExpense(e)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ValidateExpense() err = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil && !errors.Is(err, ErrInvalid) {
				t.Fatalf("error %v does not wrap ErrInvalid", err)
			}
		})
	}
}

func TestExpenseJSON(t *testing.T) {
	e := Expense{
		ID: "e1", Category: ExpenseParts, Description: "Patch cable", AmountCents: 1000,
		Status: ExpensePending, CreatedAt: time.Date(2026, 10, 19, 13, 30, 0, 0, time.UTC),
	}
	data, err := json.Marshal(e)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"id":"e1","category":"Parts","description":"Patch cable","amountCents":1000,"status":"Pending","createdAt":"2026-10-19T13:30:00Z"}`
	if string(data) != want {
		t.Fatalf("JSON = %s, want %s", data, want)
	}
	e.Status, e.Reason = ExpenseRejected, "Not covered"
	data, err = json.Marshal(e)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), `"reason":"Not covered"`) {
		t.Fatalf("rejected expense JSON missing reason: %s", data)
	}
}

func TestWorkOrderJSONOmitsExpenses(t *testing.T) {
	w := validPublished()
	before, err := json.Marshal(w)
	if err != nil {
		t.Fatal(err)
	}
	w.Expenses = []Expense{{ID: "e1", Category: ExpenseParts}}
	after, err := json.Marshal(w)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatalf("expenses changed work order JSON: %s", after)
	}
}

func validPublished() WorkOrder {
	start := time.Date(2026, 10, 23, 9, 0, 0, 0, time.UTC)
	return WorkOrder{
		Title:      "Install access points",
		TypeOfWork: "Networking",
		Status:     StatusPublished,
		Buyer:      "Northwind Retail",
		Location:   Location{City: "Minneapolis", State: "MN"},
		Schedule:   &Schedule{Start: start, End: start.Add(4 * time.Hour)},
		Pay:        Pay{Type: PayHourly, Rate: 65, Hours: 4},
	}
}

func TestValidateNew(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*WorkOrder)
		wantErr bool
	}{
		{"valid published", func(*WorkOrder) {}, false},
		{"draft needs only a title", func(w *WorkOrder) { *w = WorkOrder{Title: "x", Status: StatusDraft} }, false},
		{"missing title", func(w *WorkOrder) { w.Title = "  " }, true},
		{"assigned is not a valid new status", func(w *WorkOrder) { w.Status = StatusAssigned }, true},
		{"published without location", func(w *WorkOrder) { w.Location = Location{} }, true},
		{"published without schedule", func(w *WorkOrder) { w.Schedule = nil }, true},
		{"end before start", func(w *WorkOrder) { w.Schedule.End = w.Schedule.Start.Add(-time.Hour) }, true},
		{"hourly without hours", func(w *WorkOrder) { w.Pay.Hours = 0 }, true},
		{"zero rate", func(w *WorkOrder) { w.Pay.Rate = 0 }, true},
		{"per device without devices", func(w *WorkOrder) { w.Pay = Pay{Type: PayPerDevice, Rate: 40} }, true},
		{"unknown pay type", func(w *WorkOrder) { w.Pay.Type = "Barter" }, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := validPublished()
			tt.mutate(&w)
			err := ValidateNew(w)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ValidateNew() err = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil && !errors.Is(err, ErrInvalid) {
				t.Fatalf("error %v does not wrap ErrInvalid", err)
			}
		})
	}
}

func TestValidateNewScheduleSpan(t *testing.T) {
	tests := []struct {
		name    string
		status  Status
		span    time.Duration
		wantErr bool
	}{
		{"published exactly 14 days", StatusPublished, 14 * 24 * time.Hour, false},
		{"published 14 days and 1 minute", StatusPublished, 14*24*time.Hour + time.Minute, true},
		{"draft with long schedule", StatusDraft, 30 * 24 * time.Hour, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := validPublished()
			w.Status = tt.status
			w.Schedule.End = w.Schedule.Start.Add(tt.span)
			err := ValidateNew(w)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ValidateNew() err = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil {
				if !errors.Is(err, ErrInvalid) {
					t.Fatalf("error %v does not wrap ErrInvalid", err)
				}
				if want := "invalid work order: schedule must not span more than 14 days"; err.Error() != want {
					t.Fatalf("ValidateNew() err = %q, want %q", err, want)
				}
			}
		})
	}
}

func TestCanTransition(t *testing.T) {
	tests := []struct {
		from, to Status
		want     bool
	}{
		{StatusDraft, StatusPublished, true},
		{StatusDraft, StatusRouted, true},
		{StatusPublished, StatusAssigned, true},
		{StatusAssigned, StatusWorkDone, true},
		{StatusWorkDone, StatusApproved, true},
		{StatusApproved, StatusPaid, true},
		{StatusDraft, StatusPaid, false},
		{StatusPaid, StatusDraft, false},
		{StatusCancelled, StatusPublished, false},
	}
	for _, tt := range tests {
		if got := CanTransition(tt.from, tt.to); got != tt.want {
			t.Errorf("CanTransition(%s, %s) = %v, want %v", tt.from, tt.to, got, tt.want)
		}
	}
}

func TestParseStatus(t *testing.T) {
	got, err := ParseStatus("work done")
	if err != nil || got != StatusWorkDone {
		t.Fatalf("ParseStatus(work done) = %q, %v", got, err)
	}
	if _, err := ParseStatus("Lost"); err == nil {
		t.Fatal("ParseStatus(Lost) want error")
	}
}
