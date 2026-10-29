package workorder

import (
	"encoding/json"
	"errors"
	"fmt"
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

func TestValidateNewTextLimits(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*WorkOrder)
		err    string
	}{
		{"title of 120 characters", func(w *WorkOrder) { w.Title = strings.Repeat("a", 120) }, ""},
		{"title of 121 characters", func(w *WorkOrder) { w.Title = strings.Repeat("a", 121) }, "title must not exceed 120 characters"},
		{"title of 120 accented characters", func(w *WorkOrder) { w.Title = strings.Repeat("\u00e9", 120) }, ""},
		{"title of 121 accented characters", func(w *WorkOrder) { w.Title = strings.Repeat("\u00e9", 121) }, "title must not exceed 120 characters"},
		{"type of work of 60 accented characters", func(w *WorkOrder) { w.TypeOfWork = strings.Repeat("\u00e9", 60) }, ""},
		{"type of work of 61 characters", func(w *WorkOrder) { w.TypeOfWork = strings.Repeat("a", 61) }, "type of work must not exceed 60 characters"},
		{"buyer of 80 accented characters", func(w *WorkOrder) { w.Buyer = strings.Repeat("\u00e9", 80) }, ""},
		{"buyer of 81 characters", func(w *WorkOrder) { w.Buyer = strings.Repeat("a", 81) }, "buyer must not exceed 80 characters"},
		{"city of 60 accented characters", func(w *WorkOrder) { w.Location.City = strings.Repeat("\u00e9", 60) }, ""},
		{"city of 61 characters", func(w *WorkOrder) { w.Location.City = strings.Repeat("a", 61) }, "city must not exceed 60 characters"},
		{"full state name", func(w *WorkOrder) { w.Location.State = "Minnesota" }, "state must be a two-letter code"},
		{"state with a digit", func(w *WorkOrder) { w.Location.State = "M1" }, "state must be a two-letter code"},
		{"state with punctuation", func(w *WorkOrder) { w.Location.State = "M!" }, "state must be a two-letter code"},
		{"non-ASCII state", func(w *WorkOrder) { w.Location.State = "\u00e9" }, "state must be a two-letter code"},
		{"two non-ASCII state letters", func(w *WorkOrder) { w.Location.State = "\u00e9\u00e9" }, "state must be a two-letter code"},
		{"lower-case state", func(w *WorkOrder) { w.Location.State = "mn" }, ""},
		{"mixed-case state", func(w *WorkOrder) { w.Location.State = "mN" }, ""},
		{"Draft with a 121-character title", func(w *WorkOrder) {
			*w = WorkOrder{Title: strings.Repeat("a", 121), Status: StatusDraft}
		}, "title must not exceed 120 characters"},
		{"Draft with no state", func(w *WorkOrder) { *w = WorkOrder{Title: "x", Status: StatusDraft} }, ""},
		{"Draft with a one-letter state", func(w *WorkOrder) {
			*w = WorkOrder{Title: "x", Status: StatusDraft, Location: Location{State: "M"}}
		}, "state must be a two-letter code"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := validPublished()
			tt.mutate(&w)
			err := ValidateNew(w)
			if tt.err == "" {
				if err != nil {
					t.Fatalf("ValidateNew() err = %v, want nil", err)
				}
				return
			}
			want := "invalid work order: " + tt.err
			if err == nil || err.Error() != want {
				t.Fatalf("ValidateNew() err = %v, want %q", err, want)
			}
			if !errors.Is(err, ErrInvalid) {
				t.Fatalf("error %v does not wrap ErrInvalid", err)
			}
		})
	}
}

func TestValidateNewTasks(t *testing.T) {
	tasks := func(n int) []Task {
		out := make([]Task, n)
		for i := range out {
			out[i] = Task{ID: fmt.Sprintf("t%d", i+1), Group: TaskPrep, Title: "Step"}
		}
		return out
	}
	tests := []struct {
		name  string
		tasks []Task
		draft bool
		err   string
	}{
		{name: "no tasks"},
		{name: "empty tasks", tasks: []Task{}},
		{name: "default tasks", tasks: DefaultTasks()},
		{name: "30 tasks", tasks: tasks(30)},
		{name: "31 tasks", tasks: tasks(31), err: "a work order can have at most 30 tasks"},
		{name: "blank id", tasks: []Task{
			{ID: "t1", Group: TaskPrep, Title: "Survey"},
			{ID: " ", Group: TaskPost, Title: "Photos"},
		}, err: "task 2 needs an id"},
		{name: "duplicate id", tasks: []Task{
			{ID: "t1", Group: TaskPrep, Title: "Survey"},
			{ID: "t1", Group: TaskPost, Title: "Photos"},
		}, err: `duplicate task id "t1"`},
		{name: "unknown group", tasks: []Task{{ID: "t5", Group: "Later", Title: "Label ports"}}, err: `task "t5" has unknown group "Later"`},
		{name: "blank title", tasks: []Task{{ID: "t5", Group: TaskOnSite, Title: "  "}}, err: `task "t5" needs a title`},
		{name: "title of 121 characters", tasks: []Task{{ID: "t5", Group: TaskPost, Title: strings.Repeat("a", 121)}}, err: `task "t5" title must not exceed 120 characters`},
		{name: "title of 120 accented characters", tasks: []Task{{ID: "t5", Group: TaskPost, Title: strings.Repeat("\u00e9", 120)}}},
		{name: "title of 121 accented characters", tasks: []Task{{ID: "t5", Group: TaskPost, Title: strings.Repeat("\u00e9", 121)}}, err: `task "t5" title must not exceed 120 characters`},
		{name: "ids are not trimmed", tasks: []Task{
			{ID: "t1", Group: TaskPrep, Title: "Survey"},
			{ID: " t1 ", Group: TaskPost, Title: "Photos"},
		}},
		{name: "Draft with a duplicate id", draft: true, tasks: []Task{
			{ID: "t1", Group: TaskPrep, Title: "Survey"},
			{ID: "t1", Group: TaskPost, Title: "Photos"},
		}, err: `duplicate task id "t1"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := validPublished()
			if tt.draft {
				w = WorkOrder{Title: "x", Status: StatusDraft}
			}
			w.Tasks = tt.tasks
			err := ValidateNew(w)
			if tt.err == "" {
				if err != nil {
					t.Fatalf("ValidateNew() err = %v, want nil", err)
				}
				return
			}
			want := "invalid work order: " + tt.err
			if err == nil || err.Error() != want {
				t.Fatalf("ValidateNew() err = %v, want %q", err, want)
			}
			if !errors.Is(err, ErrInvalid) {
				t.Fatalf("error %v does not wrap ErrInvalid", err)
			}
		})
	}
}

func TestValidateNewErrorOrder(t *testing.T) {
	w := WorkOrder{
		Title: " ", Status: StatusAssigned,
		TypeOfWork: strings.Repeat("a", 61), Buyer: strings.Repeat("a", 81),
		Location: Location{City: strings.Repeat("a", 61), State: "M1"},
		Tasks:    make([]Task, 31),
	}
	checks := []struct {
		mutate func()
		err    string
	}{
		{func() {}, "title is required"},
		{func() { w.Title = strings.Repeat("a", 121) }, "new work orders must be Draft or Published"},
		{func() { w.Status = StatusDraft }, "title must not exceed 120 characters"},
		{func() { w.Title = "x" }, "type of work must not exceed 60 characters"},
		{func() { w.TypeOfWork = "" }, "buyer must not exceed 80 characters"},
		{func() { w.Buyer = "" }, "city must not exceed 60 characters"},
		{func() { w.Location.City = "" }, "state must be a two-letter code"},
		{func() { w.Location.State = "" }, "a work order can have at most 30 tasks"},
		{func() { w.Tasks = w.Tasks[:2] }, "task 1 needs an id"},
		{func() { w.Tasks[0].ID = "t1" }, `task "t1" has unknown group ""`},
		{func() { w.Tasks[0].Group = TaskPrep }, `task "t1" needs a title`},
		{func() { w.Tasks[0].Title = strings.Repeat("a", 121) }, `task "t1" title must not exceed 120 characters`},
		{func() { w.Tasks[0].Title = "Survey" }, "task 2 needs an id"},
		{func() { w.Tasks[1].ID = "t1" }, `duplicate task id "t1"`},
	}
	for _, check := range checks {
		check.mutate()
		err := ValidateNew(w)
		want := "invalid work order: " + check.err
		if err == nil || err.Error() != want {
			t.Fatalf("ValidateNew() err = %v, want %q", err, want)
		}
		if !errors.Is(err, ErrInvalid) {
			t.Fatalf("error %v does not wrap ErrInvalid", err)
		}
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
