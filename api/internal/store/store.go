// Package store keeps work orders and providers in memory. It loads an
// embedded seed file at startup. Data does not survive a restart.
package store

import (
	"cmp"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

//go:embed seed.json
var seedJSON []byte

// ErrNotFound is returned when an id does not exist.
var ErrNotFound = errors.New("not found")

// ErrConflict is returned when a change is not allowed in the current state.
var ErrConflict = errors.New("conflict")

// ErrPendingExpenses is returned when approval needs expense decisions first.
var ErrPendingExpenses = errors.New("approve or reject the pending expenses first")

// ErrExpensesClosed is returned when the work order no longer accepts expenses.
var ErrExpensesClosed = fmt.Errorf("%w: expenses can change only while the work order is Assigned or Work Done", ErrConflict)

// Filter narrows a work order listing. Zero values match everything.
type Filter struct {
	Status     workorder.Status
	ProviderID string
	TypeOfWork string
}

// Store is a concurrency-safe in-memory store.
type Store struct {
	mu         sync.RWMutex
	workOrders map[int]workorder.WorkOrder
	providers  map[string]workorder.Provider
	nextID     int
}

type seedFile struct {
	Providers  []workorder.Provider `json:"providers"`
	WorkOrders []struct {
		workorder.WorkOrder
		Expenses []workorder.Expense `json:"expenses"`
	} `json:"workOrders"`
}

// New returns an empty store.
func New() *Store {
	return &Store{
		workOrders: map[int]workorder.WorkOrder{},
		providers:  map[string]workorder.Provider{},
		nextID:     1,
	}
}

// NewSeeded returns a store loaded with the embedded seed data.
func NewSeeded() (*Store, error) {
	var seed seedFile
	if err := json.Unmarshal(seedJSON, &seed); err != nil {
		return nil, fmt.Errorf("parse seed: %w", err)
	}
	s := New()
	for _, p := range seed.Providers {
		s.providers[p.ID] = p
	}
	for _, w := range seed.WorkOrders {
		w.WorkOrder.Expenses = w.Expenses
		s.workOrders[w.ID] = w.WorkOrder
		if w.ID >= s.nextID {
			s.nextID = w.ID + 1
		}
	}
	return s, nil
}

// ListWorkOrders returns work orders that match f, newest id first.
func (s *Store) ListWorkOrders(f Filter) []workorder.WorkOrder {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]workorder.WorkOrder, 0, len(s.workOrders))
	for _, w := range s.workOrders {
		if f.Status != "" && w.Status != f.Status {
			continue
		}
		if f.ProviderID != "" && w.ProviderID != f.ProviderID {
			continue
		}
		if f.TypeOfWork != "" && !strings.EqualFold(w.TypeOfWork, f.TypeOfWork) {
			continue
		}
		out = append(out, clone(w))
	}
	slices.SortFunc(out, func(a, b workorder.WorkOrder) int { return b.ID - a.ID })
	return out
}

// GetWorkOrder returns one work order.
func (s *Store) GetWorkOrder(id int) (workorder.WorkOrder, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	w, ok := s.workOrders[id]
	if !ok {
		return workorder.WorkOrder{}, ErrNotFound
	}
	return clone(w), nil
}

// CreateWorkOrder validates w, assigns an id, and stores it.
func (s *Store) CreateWorkOrder(w workorder.WorkOrder) (workorder.WorkOrder, error) {
	if err := workorder.ValidateNew(w); err != nil {
		return workorder.WorkOrder{}, err
	}
	if len(w.Tasks) == 0 {
		w.Tasks = workorder.DefaultTasks()
	}
	if w.Health == "" {
		w.Health = workorder.HealthOnTrack
	}
	w.ProviderID = ""
	w.SubStatus = ""
	w.CheckIn, w.CheckOut = nil, nil
	w.Expenses = nil

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.nextID < 1000000 {
		s.nextID = 1000000
	}
	w.ID = s.nextID
	s.nextID++
	s.workOrders[w.ID] = w
	return clone(w), nil
}

// update loads a work order, applies fn under the write lock, and saves it.
func (s *Store) update(id int, fn func(*workorder.WorkOrder) error) (workorder.WorkOrder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	w, ok := s.workOrders[id]
	if !ok {
		return workorder.WorkOrder{}, ErrNotFound
	}
	w = clone(w)
	if err := fn(&w); err != nil {
		return workorder.WorkOrder{}, err
	}
	s.workOrders[id] = w
	return clone(w), nil
}

// SetStatus moves a work order to a new status if the lifecycle allows it.
func (s *Store) SetStatus(id int, to workorder.Status) (workorder.WorkOrder, error) {
	return s.update(id, func(w *workorder.WorkOrder) error {
		if !workorder.CanTransition(w.Status, to) {
			return fmt.Errorf("%w: cannot move from %s to %s", ErrConflict, w.Status, to)
		}
		if to == workorder.StatusApproved {
			for _, e := range w.Expenses {
				if e.Status == workorder.ExpensePending {
					return ErrPendingExpenses
				}
			}
		}
		w.Status = to
		if to != workorder.StatusAssigned {
			w.SubStatus = ""
		}
		return nil
	})
}

// SetTaskDone marks one task done or not done.
func (s *Store) SetTaskDone(id int, taskID string, done bool) (workorder.WorkOrder, error) {
	return s.update(id, func(w *workorder.WorkOrder) error {
		for i := range w.Tasks {
			if w.Tasks[i].ID == taskID {
				w.Tasks[i].Done = done
				return nil
			}
		}
		return ErrNotFound
	})
}

// Expenses returns a copy of a work order's expenses.
func (s *Store) Expenses(id int) ([]workorder.Expense, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	w, ok := s.workOrders[id]
	if !ok {
		return nil, ErrNotFound
	}
	out := make([]workorder.Expense, len(w.Expenses))
	copy(out, w.Expenses)
	return out, nil
}

// AddExpense validates an expense and assigns its server-owned fields.
func (s *Store) AddExpense(id int, e workorder.Expense) (workorder.Expense, error) {
	_, err := s.update(id, func(w *workorder.WorkOrder) error {
		if !w.AcceptsExpenses() {
			return ErrExpensesClosed
		}
		if err := workorder.ValidateExpense(e); err != nil {
			return err
		}
		e.ID = fmt.Sprintf("e%d", len(w.Expenses)+1)
		e.Status = workorder.ExpensePending
		e.CreatedAt = time.Now().UTC()
		e.Reason = ""
		w.Expenses = append(w.Expenses, e)
		return nil
	})
	if err != nil {
		return workorder.Expense{}, err
	}
	return e, nil
}

// SetExpenseStatus records a decision, keeping a reason only for rejection.
func (s *Store) SetExpenseStatus(id int, expenseID string, status workorder.ExpenseStatus, reason string) (workorder.Expense, error) {
	var expense workorder.Expense
	_, err := s.update(id, func(w *workorder.WorkOrder) error {
		i := expenseIndex(w.Expenses, expenseID)
		if i < 0 {
			return ErrNotFound
		}
		switch status {
		case workorder.ExpensePending, workorder.ExpenseApproved, workorder.ExpenseRejected:
		default:
			return fmt.Errorf("%w: unknown expense status %q", workorder.ErrInvalid, status)
		}
		w.Expenses[i].Status = status
		w.Expenses[i].Reason = ""
		if status == workorder.ExpenseRejected {
			w.Expenses[i].Reason = reason
		}
		expense = w.Expenses[i]
		return nil
	})
	if err != nil {
		return workorder.Expense{}, err
	}
	return expense, nil
}

// DecideExpense approves or rejects a pending expense while expenses are open.
func (s *Store) DecideExpense(id int, expenseID string, status workorder.ExpenseStatus, reason string) (workorder.Expense, error) {
	if status != workorder.ExpenseApproved && status != workorder.ExpenseRejected {
		return workorder.Expense{}, fmt.Errorf("%w: expense decision must be Approved or Rejected", workorder.ErrInvalid)
	}
	if status == workorder.ExpenseRejected {
		if err := workorder.ValidateRejectReason(reason); err != nil {
			return workorder.Expense{}, err
		}
	}
	var expense workorder.Expense
	_, err := s.update(id, func(w *workorder.WorkOrder) error {
		if !w.AcceptsExpenses() {
			return ErrExpensesClosed
		}
		i := expenseIndex(w.Expenses, expenseID)
		if i < 0 {
			return ErrNotFound
		}
		if current := w.Expenses[i].Status; current != workorder.ExpensePending {
			return fmt.Errorf("%w: expense %s is already %s", ErrConflict, expenseID, current)
		}
		w.Expenses[i].Status = status
		w.Expenses[i].Reason = ""
		if status == workorder.ExpenseRejected {
			w.Expenses[i].Reason = strings.TrimSpace(reason)
		}
		expense = w.Expenses[i]
		return nil
	})
	if err != nil {
		return workorder.Expense{}, err
	}
	return expense, nil
}

func expenseIndex(expenses []workorder.Expense, id string) int {
	return slices.IndexFunc(expenses, func(e workorder.Expense) bool { return e.ID == id })
}

// CheckIn records the provider's arrival on site.
func (s *Store) CheckIn(id int, at time.Time) (workorder.WorkOrder, error) {
	return s.update(id, func(w *workorder.WorkOrder) error {
		if w.Status != workorder.StatusAssigned {
			return fmt.Errorf("%w: only assigned work orders can check in", ErrConflict)
		}
		w.CheckIn = &at
		w.SubStatus = workorder.SubCheckedIn
		return nil
	})
}

// CheckOut records the provider leaving the site.
func (s *Store) CheckOut(id int, at time.Time) (workorder.WorkOrder, error) {
	return s.update(id, func(w *workorder.WorkOrder) error {
		if w.Status != workorder.StatusAssigned {
			return fmt.Errorf("%w: only assigned work orders can check out", ErrConflict)
		}
		w.CheckOut = &at
		w.SubStatus = workorder.SubCheckedOut
		return nil
	})
}

// ListProviders returns all providers, highest score first.
func (s *Store) ListProviders() []workorder.Provider {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]workorder.Provider, 0, len(s.providers))
	for _, p := range s.providers {
		out = append(out, p)
	}
	slices.SortFunc(out, func(a, b workorder.Provider) int {
		if a.Score != b.Score {
			return b.Score - a.Score
		}
		return cmp.Compare(a.Name, b.Name)
	})
	return out
}

// GetProvider returns one provider.
func (s *Store) GetProvider(id string) (workorder.Provider, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, ok := s.providers[id]
	if !ok {
		return workorder.Provider{}, ErrNotFound
	}
	return p, nil
}

func clone(w workorder.WorkOrder) workorder.WorkOrder {
	w.Tasks = slices.Clone(w.Tasks)
	w.Expenses = slices.Clone(w.Expenses)
	if w.Schedule != nil {
		sc := *w.Schedule
		w.Schedule = &sc
	}
	if w.CheckIn != nil {
		t := *w.CheckIn
		w.CheckIn = &t
	}
	if w.CheckOut != nil {
		t := *w.CheckOut
		w.CheckOut = &t
	}
	return w
}
