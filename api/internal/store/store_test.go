package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

func seeded(t *testing.T) *Store {
	t.Helper()
	s, err := NewSeeded()
	if err != nil {
		t.Fatalf("NewSeeded: %v", err)
	}
	return s
}

func createPublished(t *testing.T, s *Store, start, end string) int {
	t.Helper()
	from, err := time.Parse(time.RFC3339, start)
	if err != nil {
		t.Fatal(err)
	}
	to, err := time.Parse(time.RFC3339, end)
	if err != nil {
		t.Fatal(err)
	}
	w, err := s.CreateWorkOrder(workorder.WorkOrder{
		Title: "Install access points", Status: workorder.StatusPublished, TypeOfWork: "Networking",
		Location: workorder.Location{City: "Edina", State: "MN"},
		Pay:      workorder.Pay{Type: workorder.PayFixed, Rate: 100},
		Schedule: &workorder.Schedule{Start: from, End: to},
	})
	if err != nil {
		t.Fatal(err)
	}
	return w.ID
}

func TestAssignProvider(t *testing.T) {
	for _, tt := range []struct {
		name       string
		id         int
		providerID string
		setup      func(*testing.T, *Store) int
		wantErr    error
		msg        string
	}{
		{name: "Published", id: 9631805, providerID: "p-104"},
		{name: "Routed", id: 9631809, providerID: "p-101"},
		{name: "empty provider", id: 9631805, wantErr: workorder.ErrInvalid, msg: "invalid work order: providerId is required"},
		{name: "blank provider", id: 9631805, providerID: "  ", wantErr: workorder.ErrInvalid, msg: "invalid work order: providerId is required"},
		{name: "unknown provider", id: 9631805, providerID: "p-999", wantErr: workorder.ErrInvalid, msg: `invalid work order: unknown provider "p-999"`},
		{name: "unknown work order", id: 1, providerID: "p-101", wantErr: ErrNotFound, msg: "not found"},
		{name: "Draft", id: 9631801, providerID: "p-101", wantErr: ErrConflict, msg: "conflict: cannot move from Draft to Assigned"},
		{name: "Assigned", id: 9631810, providerID: "p-104", wantErr: ErrConflict, msg: "conflict: cannot move from Assigned to Assigned"},
		{name: "provider validation before status", id: 9631801, providerID: "p-999", wantErr: workorder.ErrInvalid, msg: `invalid work order: unknown provider "p-999"`},
		{name: "missing schedule", providerID: "p-101", wantErr: ErrConflict, setup: func(t *testing.T, s *Store) int {
			w, err := s.CreateWorkOrder(workorder.WorkOrder{Title: "Unscheduled", Status: workorder.StatusDraft})
			if err != nil {
				t.Fatal(err)
			}
			if _, err := s.SetStatus(w.ID, workorder.StatusRouted); err != nil {
				t.Fatal(err)
			}
			return w.ID
		}},
		{name: "double booking", providerID: "p-101", wantErr: ErrConflict, msg: "conflict: Dana Whitfield is booked on work order 9631817 at that time", setup: func(t *testing.T, s *Store) int {
			return createPublished(t, s, "2026-10-22T10:00:00-05:00", "2026-10-22T12:00:00-05:00")
		}},
		{name: "lowest id", providerID: "p-104", wantErr: ErrConflict, setup: func(t *testing.T, s *Store) int {
			first := createPublished(t, s, "2026-10-30T09:00:00-05:00", "2026-10-30T10:00:00-05:00")
			second := createPublished(t, s, "2026-10-30T10:00:00-05:00", "2026-10-30T11:00:00-05:00")
			for _, id := range []int{first, second} {
				if _, err := s.AssignProvider(id, "p-104"); err != nil {
					t.Fatalf("assign touching windows: %v", err)
				}
			}
			return createPublished(t, s, "2026-10-30T09:30:00-05:00", "2026-10-30T10:30:00-05:00")
		}},
		{name: "Work Done does not block", providerID: "p-104", setup: func(t *testing.T, s *Store) int {
			return createPublished(t, s, "2026-10-16T09:00:00-05:00", "2026-10-16T10:00:00-05:00")
		}},
		{name: "Paid does not block", providerID: "p-101", setup: func(t *testing.T, s *Store) int {
			return createPublished(t, s, "2026-10-08T07:30:00-05:00", "2026-10-08T08:30:00-05:00")
		}},
		{name: "clears sub-status", id: 9631805, providerID: "p-104", setup: func(t *testing.T, s *Store) int {
			w := s.workOrders[9631805]
			w.SubStatus = workorder.SubConfirmed
			s.workOrders[w.ID] = w
			return w.ID
		}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s := seeded(t)
			id := tt.id
			if tt.setup != nil {
				id = tt.setup(t, s)
			}
			before, beforeErr := s.GetWorkOrder(id)
			if beforeErr != nil && !errors.Is(beforeErr, ErrNotFound) {
				t.Fatal(beforeErr)
			}
			got, err := s.AssignProvider(id, tt.providerID)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("AssignProvider err = %v, want %v", err, tt.wantErr)
			}
			after, afterErr := s.GetWorkOrder(id)
			if err != nil {
				msg := tt.msg
				if tt.name == "missing schedule" {
					msg = fmt.Sprintf("conflict: work order %d has no schedule", id)
				} else if tt.name == "lowest id" {
					msg = fmt.Sprintf("conflict: Tomas Lindqvist is booked on work order %d at that time", id-2)
				}
				if err.Error() != msg {
					t.Errorf("error = %q, want %q", err, msg)
				}
				if !errors.Is(afterErr, beforeErr) || !reflect.DeepEqual(before, after) {
					t.Fatalf("failed assignment changed work order: before %+v, after %+v, err %v", before, after, afterErr)
				}
				return
			}
			if got.Status != workorder.StatusAssigned || got.ProviderID != tt.providerID || got.SubStatus != "" {
				t.Fatalf("assigned work order = %+v", got)
			}
			if afterErr != nil || !reflect.DeepEqual(got, after) {
				t.Fatalf("stored work order = %+v, err = %v, want %+v", after, afterErr, got)
			}
		})
	}
}

func TestAssignProviderNonBlockingWorkOrders(t *testing.T) {
	for _, status := range []workorder.Status{workorder.StatusWorkDone, workorder.StatusApproved, workorder.StatusPaid, workorder.StatusCancelled} {
		t.Run(string(status), func(t *testing.T) {
			s := seeded(t)
			other := s.workOrders[9631817]
			other.Status = status
			s.workOrders[other.ID] = other
			id := createPublished(t, s, "2026-10-22T10:00:00-05:00", "2026-10-22T12:00:00-05:00")
			if _, err := s.AssignProvider(id, "p-101"); err != nil {
				t.Fatalf("%s blocked assignment: %v", status, err)
			}
		})
	}
	t.Run("Assigned without schedule", func(t *testing.T) {
		s := seeded(t)
		other := s.workOrders[9631817]
		other.Schedule = nil
		s.workOrders[other.ID] = other
		id := createPublished(t, s, "2026-10-22T10:00:00-05:00", "2026-10-22T12:00:00-05:00")
		if _, err := s.AssignProvider(id, "p-101"); err != nil {
			t.Fatal(err)
		}
	})
}

func TestAssignProviderConcurrent(t *testing.T) {
	s := seeded(t)
	ids := []int{
		createPublished(t, s, "2026-10-30T09:00:00-05:00", "2026-10-30T10:00:00-05:00"),
		createPublished(t, s, "2026-10-30T09:00:00-05:00", "2026-10-30T10:00:00-05:00"),
	}
	start := make(chan struct{})
	results := make(chan error, len(ids))
	for _, id := range ids {
		go func() {
			<-start
			_, err := s.AssignProvider(id, "p-104")
			results <- err
		}()
	}
	close(start)
	successes, conflicts := 0, 0
	for range ids {
		err := <-results
		switch {
		case err == nil:
			successes++
		case errors.Is(err, ErrConflict):
			conflicts++
		default:
			t.Errorf("unexpected assignment error: %v", err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("got %d successes and %d conflicts, want one each", successes, conflicts)
	}
}

func TestSeedIsConsistent(t *testing.T) {
	s := seeded(t)
	all := s.ListWorkOrders(Filter{})
	if len(all) < 20 {
		t.Fatalf("seed has %d work orders, want at least 20", len(all))
	}
	if len(s.ListProviders()) < 5 {
		t.Fatal("seed has too few providers")
	}
	for _, w := range all {
		if w.ProviderID != "" {
			if _, err := s.GetProvider(w.ProviderID); err != nil {
				t.Errorf("work order %d references unknown provider %q", w.ID, w.ProviderID)
			}
		}
		if len(w.Tasks) == 0 {
			t.Errorf("work order %d has no tasks", w.ID)
		}
		if err := workorder.ValidatePay(w.Pay); err != nil && w.Pay.Type != workorder.PayBlended {
			t.Errorf("work order %d has invalid pay: %v", w.ID, err)
		}
	}
}

func TestListWorkOrdersFilters(t *testing.T) {
	s := seeded(t)
	for _, w := range s.ListWorkOrders(Filter{Status: workorder.StatusAssigned}) {
		if w.Status != workorder.StatusAssigned {
			t.Fatalf("status filter returned %s", w.Status)
		}
	}
	for _, w := range s.ListWorkOrders(Filter{ProviderID: "p-101"}) {
		if w.ProviderID != "p-101" {
			t.Fatalf("provider filter returned %q", w.ProviderID)
		}
	}
	list := s.ListWorkOrders(Filter{})
	for i := 1; i < len(list); i++ {
		if list[i-1].ID < list[i].ID {
			t.Fatal("list is not sorted newest id first")
		}
	}
}

func TestListWorkOrdersTypeOfWorkFilter(t *testing.T) {
	s := seeded(t)
	tests := []struct {
		name   string
		filter Filter
		want   []int
	}{
		{
			name:   "seed type",
			filter: Filter{TypeOfWork: "Networking"},
			want:   []int{9631824, 9631820, 9631810, 9631802},
		},
		{
			name:   "different case",
			filter: Filter{TypeOfWork: "nEtWoRkInG"},
			want:   []int{9631824, 9631820, 9631810, 9631802},
		},
		{
			name:   "unknown type",
			filter: Filter{TypeOfWork: "Plumbing"},
		},
		{
			name:   "partial type does not match",
			filter: Filter{TypeOfWork: "Network"},
		},
		{
			name:   "combined with status",
			filter: Filter{TypeOfWork: "Networking", Status: workorder.StatusAssigned},
			want:   []int{9631810},
		},
		{
			name:   "combined with provider",
			filter: Filter{TypeOfWork: "Networking", ProviderID: "p-101"},
			want:   []int{9631810},
		},
		{
			name:   "combined with status and provider",
			filter: Filter{TypeOfWork: "networking", Status: workorder.StatusAssigned, ProviderID: "p-101"},
			want:   []int{9631810},
		},
		{
			name:   "combined filters with no match",
			filter: Filter{TypeOfWork: "Networking", Status: workorder.StatusAssigned, ProviderID: "p-103"},
		},
		{
			name:   "empty type preserves other filters",
			filter: Filter{Status: workorder.StatusAssigned, ProviderID: "p-101"},
			want:   []int{9631817, 9631810},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := s.ListWorkOrders(tt.filter)
			if len(got) != len(tt.want) {
				t.Fatalf("got %d work orders, want %d", len(got), len(tt.want))
			}
			for i, w := range got {
				if w.ID != tt.want[i] {
					t.Errorf("work order at index %d = %d, want %d", i, w.ID, tt.want[i])
				}
			}
		})
	}
}

func TestCreateWorkOrderAssignsIDAndDefaults(t *testing.T) {
	s := seeded(t)
	created, err := s.CreateWorkOrder(workorder.WorkOrder{
		Title: "New draft", Status: workorder.StatusDraft, ProviderID: "p-101",
		Expenses: []workorder.Expense{{ID: "caller-expense"}},
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder: %v", err)
	}
	if created.ID == 0 || created.ProviderID != "" {
		t.Fatalf("got id %d provider %q, want new id and no provider", created.ID, created.ProviderID)
	}
	if len(created.Tasks) != len(workorder.DefaultTasks()) {
		t.Fatalf("got %d tasks, want default tasks", len(created.Tasks))
	}
	if created.Health != workorder.HealthOnTrack {
		t.Fatalf("health = %q", created.Health)
	}
	if len(created.Expenses) != 0 {
		t.Fatalf("new work order has caller-supplied expenses: %+v", created.Expenses)
	}
	if _, err := s.GetWorkOrder(created.ID); err != nil {
		t.Fatalf("GetWorkOrder after create: %v", err)
	}
}

func TestCreateWorkOrderRejectsInvalid(t *testing.T) {
	_, err := New().CreateWorkOrder(workorder.WorkOrder{Status: workorder.StatusDraft})
	if !errors.Is(err, workorder.ErrInvalid) {
		t.Fatalf("err = %v, want ErrInvalid", err)
	}
}

func TestSetStatus(t *testing.T) {
	s := seeded(t)
	if _, err := s.SetStatus(9631818, workorder.StatusApproved); err != nil {
		t.Fatalf("Work Done -> Approved: %v", err)
	}
	if _, err := s.SetStatus(9631801, workorder.StatusPaid); !errors.Is(err, ErrConflict) {
		t.Fatalf("Draft -> Paid err = %v, want ErrConflict", err)
	}
	if _, err := s.SetStatus(1, workorder.StatusPaid); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown id err = %v, want ErrNotFound", err)
	}
}

func TestSetStatusWithExpenses(t *testing.T) {
	for _, tt := range []struct {
		name     string
		from, to workorder.Status
		expenses []workorder.Expense
		wantErr  error
	}{
		{"pending", workorder.StatusWorkDone, workorder.StatusApproved, []workorder.Expense{{Status: workorder.ExpenseApproved}, {Status: workorder.ExpensePending}}, ErrPendingExpenses},
		{"decided", workorder.StatusWorkDone, workorder.StatusApproved, []workorder.Expense{{Status: workorder.ExpenseApproved}, {Status: workorder.ExpenseRejected}}, nil},
		{"none", workorder.StatusWorkDone, workorder.StatusApproved, nil, nil},
		{"other transition", workorder.StatusAssigned, workorder.StatusWorkDone, []workorder.Expense{{Status: workorder.ExpensePending}}, nil},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s := New()
			s.workOrders[1] = workorder.WorkOrder{ID: 1, Status: tt.from, Expenses: tt.expenses}
			_, err := s.SetStatus(1, tt.to)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("SetStatus err = %v, want %v", err, tt.wantErr)
			}
			w, err := s.GetWorkOrder(1)
			if err != nil {
				t.Fatal(err)
			}
			wantStatus := tt.to
			if tt.wantErr != nil {
				wantStatus = tt.from
			}
			if w.Status != wantStatus || !slices.Equal(w.Expenses, tt.expenses) {
				t.Fatalf("stored work order = %+v, want status %s and unchanged expenses", w, wantStatus)
			}
		})
	}
}

func TestSetTaskDone(t *testing.T) {
	s := seeded(t)
	w, err := s.SetTaskDone(9631801, "t1", true)
	if err != nil {
		t.Fatalf("SetTaskDone: %v", err)
	}
	if !w.Tasks[0].Done {
		t.Fatal("task t1 not marked done")
	}
	if _, err := s.SetTaskDone(9631801, "nope", true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown task err = %v", err)
	}
}

func TestCheckInAndOut(t *testing.T) {
	s := seeded(t)
	at := time.Date(2026, 10, 22, 9, 5, 0, 0, time.UTC)
	w, err := s.CheckIn(9631817, at)
	if err != nil {
		t.Fatalf("CheckIn: %v", err)
	}
	if w.CheckIn == nil || !w.CheckIn.Equal(at) || w.SubStatus != workorder.SubCheckedIn {
		t.Fatalf("check in not recorded: %+v", w)
	}
	w, err = s.CheckOut(9631817, at.Add(3*time.Hour))
	if err != nil {
		t.Fatalf("CheckOut: %v", err)
	}
	if w.SubStatus != workorder.SubCheckedOut {
		t.Fatalf("sub-status = %q", w.SubStatus)
	}
	if _, err := s.CheckIn(9631801, at); !errors.Is(err, ErrConflict) {
		t.Fatalf("check in on draft err = %v, want ErrConflict", err)
	}
}

func TestReturnedValuesAreCopies(t *testing.T) {
	s := seeded(t)
	w, _ := s.GetWorkOrder(9631810)
	w.Tasks[0].Title = "changed"
	again, _ := s.GetWorkOrder(9631810)
	if again.Tasks[0].Title == "changed" {
		t.Fatal("caller mutation leaked into the store")
	}
}

func TestExpenses(t *testing.T) {
	s := seeded(t)
	expenses, err := s.Expenses(9631810)
	if err != nil {
		t.Fatalf("Expenses: %v", err)
	}
	if len(expenses) != 2 {
		t.Fatalf("got %d expenses, want 2", len(expenses))
	}
	w, err := s.GetWorkOrder(9631810)
	if err != nil || w.Status != workorder.StatusAssigned || !slices.Equal(w.Expenses, expenses) {
		t.Fatalf("seeded work order = %+v, err = %v", w, err)
	}
	for i, e := range expenses {
		if err := workorder.ValidateExpense(e); err != nil || e.CreatedAt.IsZero() {
			t.Fatalf("invalid seeded expense: %+v, err = %v", e, err)
		}
		wantCategory := []workorder.ExpenseCategory{workorder.ExpenseParts, workorder.ExpenseMileage}[i]
		wantStatus := []workorder.ExpenseStatus{workorder.ExpensePending, workorder.ExpenseApproved}[i]
		if e.Category != wantCategory || e.Status != wantStatus {
			t.Fatalf("seed expense %d = %+v", i, e)
		}
	}
	empty, err := s.Expenses(9631801)
	if err != nil || empty == nil || len(empty) != 0 {
		t.Fatalf("empty Expenses = %v, err = %v", empty, err)
	}
	data, err := json.Marshal(empty)
	if err != nil || string(data) != "[]" {
		t.Fatalf("empty expenses JSON = %s, err = %v", data, err)
	}
}

func TestAddExpense(t *testing.T) {
	s := seeded(t)
	input := workorder.Expense{
		ID: "caller-id", Category: workorder.ExpenseTools, Description: "Cable tester rental", AmountCents: 3500,
		Status: workorder.ExpenseRejected, CreatedAt: time.Unix(1, 0), Reason: "caller reason",
	}
	before := time.Now()
	added, err := s.AddExpense(9631810, input)
	if err != nil {
		t.Fatalf("AddExpense: %v", err)
	}
	if added.ID != "e3" || added.Status != workorder.ExpensePending || added.Reason != "" {
		t.Fatalf("server fields not assigned: %+v", added)
	}
	if added.CreatedAt.Before(before) || added.CreatedAt.After(time.Now()) {
		t.Fatalf("createdAt = %v, want current time", added.CreatedAt)
	}
	if added.Category != input.Category || added.Description != input.Description || added.AmountCents != input.AmountCents {
		t.Fatalf("expense details changed: %+v", added)
	}
	again, err := s.AddExpense(9631810, input)
	if err != nil || again.ID != "e4" {
		t.Fatalf("second expense = %+v, err = %v", again, err)
	}
	expenses, err := s.Expenses(9631810)
	if err != nil || len(expenses) != 4 || expenses[2] != added || expenses[3] != again {
		t.Fatalf("stored expenses = %+v, err = %v", expenses, err)
	}
	input.AmountCents = 0
	if _, err := s.AddExpense(9631810, input); !errors.Is(err, workorder.ErrInvalid) {
		t.Fatalf("invalid expense err = %v, want ErrInvalid", err)
	}
	unchanged, err := s.Expenses(9631810)
	if err != nil || !slices.Equal(unchanged, expenses) {
		t.Fatalf("invalid expense changed store: %+v, err = %v", unchanged, err)
	}
	first, err := s.AddExpense(9631811, workorder.Expense{Category: workorder.ExpenseOther, Description: "Shipping", AmountCents: 500})
	if err != nil || first.ID != "e1" {
		t.Fatalf("first expense = %+v, err = %v", first, err)
	}
}

func TestAddExpenseClosedWorkOrder(t *testing.T) {
	s := seeded(t)
	input := workorder.Expense{Category: workorder.ExpenseParts, Description: "Patch cable", AmountCents: 1000}
	for _, id := range []int{9631801, 9631821, 9631823, 9631825} {
		for _, expense := range []workorder.Expense{input, {}} {
			if _, err := s.AddExpense(id, expense); !errors.Is(err, ErrConflict) || !errors.Is(err, ErrExpensesClosed) {
				t.Fatalf("AddExpense(%d) err = %v, want ErrConflict and ErrExpensesClosed", id, err)
			}
			expenses, err := s.Expenses(id)
			if err != nil || len(expenses) != 0 {
				t.Fatalf("closed work order %d expenses = %+v, err = %v", id, expenses, err)
			}
		}
	}
	first, err := s.AddExpense(9631818, input)
	if err != nil || first.ID != "e1" {
		t.Fatalf("Work Done first expense = %+v, err = %v", first, err)
	}
}

func TestSetExpenseStatus(t *testing.T) {
	s := seeded(t)
	original, err := s.Expenses(9631810)
	if err != nil {
		t.Fatal(err)
	}
	for _, status := range []workorder.ExpenseStatus{workorder.ExpenseRejected, workorder.ExpenseApproved, workorder.ExpensePending} {
		updated, err := s.SetExpenseStatus(9631810, "e1", status, "Not covered")
		if err != nil {
			t.Fatalf("SetExpenseStatus(%s): %v", status, err)
		}
		want := original[0]
		want.Status = status
		if status == workorder.ExpenseRejected {
			want.Reason = "Not covered"
		}
		if updated != want {
			t.Fatalf("updated = %+v, want %+v", updated, want)
		}
		expenses, err := s.Expenses(9631810)
		if err != nil || expenses[0] != want || expenses[1] != original[1] {
			t.Fatalf("stored expenses = %+v, err = %v", expenses, err)
		}
	}
	if _, err := s.SetExpenseStatus(9631810, "missing", workorder.ExpenseApproved, ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown expense err = %v, want ErrNotFound", err)
	}
	if _, err := s.SetExpenseStatus(9631810, "e1", "Unknown", ""); !errors.Is(err, workorder.ErrInvalid) {
		t.Fatalf("unknown status err = %v, want ErrInvalid", err)
	}
	after, err := s.Expenses(9631810)
	if err != nil || !slices.Equal(after, original) {
		t.Fatalf("failed update changed expenses: %+v, err = %v", after, err)
	}
}

func TestExpensesUnknownWorkOrder(t *testing.T) {
	s := seeded(t)
	if _, err := s.Expenses(1); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Expenses unknown id err = %v, want ErrNotFound", err)
	}
	if _, err := s.AddExpense(1, workorder.Expense{Category: workorder.ExpenseParts, Description: "Cable", AmountCents: 100}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("AddExpense unknown id err = %v, want ErrNotFound", err)
	}
	if _, err := s.SetExpenseStatus(1, "e1", workorder.ExpenseApproved, ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("SetExpenseStatus unknown id err = %v, want ErrNotFound", err)
	}
}

func TestReturnedExpensesAreCopies(t *testing.T) {
	s := seeded(t)
	original, _ := s.Expenses(9631810)
	list, _ := s.Expenses(9631810)
	list[0].Description = "changed through Expenses"
	w, _ := s.GetWorkOrder(9631810)
	w.Expenses[0].Description = "changed through GetWorkOrder"
	orders := s.ListWorkOrders(Filter{Status: workorder.StatusAssigned})
	for _, w := range orders {
		if w.ID == 9631810 {
			w.Expenses[0].Description = "changed through ListWorkOrders"
		}
	}
	updated, err := s.SetTaskDone(9631810, "t1", true)
	if err != nil {
		t.Fatal(err)
	}
	updated.Expenses[0].Description = "changed through update"
	again, err := s.Expenses(9631810)
	if err != nil || !slices.Equal(again, original) {
		t.Fatalf("caller mutation leaked into store: %+v, err = %v", again, err)
	}
}
