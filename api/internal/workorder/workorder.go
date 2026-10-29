// Package workorder holds the Flightboard domain model: work orders,
// their lifecycle statuses, tasks, pay, and providers.
package workorder

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// Status is the lifecycle status of a work order.
type Status string

const (
	StatusDraft     Status = "Draft"
	StatusPublished Status = "Published"
	StatusRouted    Status = "Routed"
	StatusAssigned  Status = "Assigned"
	StatusWorkDone  Status = "Work Done"
	StatusApproved  Status = "Approved"
	StatusPaid      Status = "Paid"
	StatusCancelled Status = "Cancelled"
)

// Statuses lists every status in lifecycle order.
var Statuses = []Status{
	StatusDraft, StatusPublished, StatusRouted, StatusAssigned,
	StatusWorkDone, StatusApproved, StatusPaid, StatusCancelled,
}

// SubStatus refines the Assigned status.
type SubStatus string

const (
	SubStartTimeSet SubStatus = "Start Time Set"
	SubConfirmed    SubStatus = "Confirmed"
	SubOnMyWay      SubStatus = "On My Way"
	SubCheckedIn    SubStatus = "Checked In"
	SubCheckedOut   SubStatus = "Checked Out"
	SubOnHold       SubStatus = "On Hold"
)

// Health is the at-a-glance health of a work order on the Flightboard.
type Health string

const (
	HealthOnTrack Health = "On Track"
	HealthReview  Health = "Review"
	HealthAlert   Health = "Alert"
)

// PayType is how the provider is paid.
type PayType string

const (
	PayFixed     PayType = "Fixed"
	PayHourly    PayType = "Hourly"
	PayPerDevice PayType = "PerDevice"
	PayBlended   PayType = "Blended"
)

// TaskGroup is the phase a task belongs to.
type TaskGroup string

const (
	TaskPrep   TaskGroup = "Prep"
	TaskOnSite TaskGroup = "On Site"
	TaskPost   TaskGroup = "Post"
)

// Pay describes the pay terms of a work order. Hours applies to Hourly
// pay and Devices applies to PerDevice pay.
type Pay struct {
	Type    PayType `json:"type"`
	Rate    float64 `json:"rate"`
	Hours   float64 `json:"hours,omitempty"`
	Devices int     `json:"devices,omitempty"`
}

// Location is where the work happens.
type Location struct {
	City  string `json:"city"`
	State string `json:"state"`
}

// Schedule is the service window.
type Schedule struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

// Task is one step the provider completes.
type Task struct {
	ID    string    `json:"id"`
	Group TaskGroup `json:"group"`
	Title string    `json:"title"`
	Done  bool      `json:"done"`
}

// ExpenseCategory is the kind of cost incurred by a provider.
type ExpenseCategory string

const (
	ExpenseParts   ExpenseCategory = "Parts"
	ExpenseMileage ExpenseCategory = "Mileage"
	ExpenseTools   ExpenseCategory = "Tools"
	ExpenseOther   ExpenseCategory = "Other"
)

// ExpenseStatus is the buyer's decision on an expense.
type ExpenseStatus string

const (
	ExpensePending  ExpenseStatus = "Pending"
	ExpenseApproved ExpenseStatus = "Approved"
	ExpenseRejected ExpenseStatus = "Rejected"
)

// Expense is a provider's reimbursable cost on a work order.
type Expense struct {
	ID          string          `json:"id"`
	Category    ExpenseCategory `json:"category"`
	Description string          `json:"description"`
	AmountCents int             `json:"amountCents"`
	Status      ExpenseStatus   `json:"status"`
	CreatedAt   time.Time       `json:"createdAt"`
	Reason      string          `json:"reason,omitempty"`
}

// Provider is a technician who does the work.
type Provider struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Score int    `json:"score"`
	City  string `json:"city"`
	State string `json:"state"`
}

// WorkOrder is a unit of field work that a buyer posts.
type WorkOrder struct {
	ID         int        `json:"id"`
	Title      string     `json:"title"`
	TypeOfWork string     `json:"typeOfWork"`
	Status     Status     `json:"status"`
	SubStatus  SubStatus  `json:"subStatus,omitempty"`
	Buyer      string     `json:"buyer"`
	ProviderID string     `json:"providerId,omitempty"`
	Location   Location   `json:"location"`
	Schedule   *Schedule  `json:"schedule,omitempty"`
	CheckIn    *time.Time `json:"checkIn,omitempty"`
	CheckOut   *time.Time `json:"checkOut,omitempty"`
	// PaidAt is when a pay run marked the work order Paid. The server owns it:
	// clients cannot send it, and the work order view shows it as paidAt.
	PaidAt   time.Time `json:"-"`
	Pay      Pay       `json:"pay"`
	Tasks    []Task    `json:"tasks"`
	Expenses []Expense `json:"-"`
	Health   Health    `json:"health"`
}

// AcceptsExpenses reports whether provider expenses may be added.
func (w WorkOrder) AcceptsExpenses() bool {
	return w.Status == StatusAssigned || w.Status == StatusWorkDone
}

// DefaultTasks returns the tasks every new work order starts with.
func DefaultTasks() []Task {
	return []Task{
		{ID: "t1", Group: TaskPrep, Title: "Set start time"},
		{ID: "t2", Group: TaskOnSite, Title: "Check in"},
		{ID: "t3", Group: TaskOnSite, Title: "Check out"},
		{ID: "t4", Group: TaskPost, Title: "Enter closeout notes"},
	}
}

// transitions lists the statuses a work order may move to from each status.
var transitions = map[Status][]Status{
	StatusDraft:     {StatusPublished, StatusRouted, StatusCancelled},
	StatusPublished: {StatusAssigned, StatusDraft, StatusCancelled},
	StatusRouted:    {StatusAssigned, StatusDraft, StatusCancelled},
	StatusAssigned:  {StatusWorkDone, StatusPublished, StatusCancelled},
	StatusWorkDone:  {StatusApproved},
	StatusApproved:  {StatusPaid},
}

// CanTransition reports whether a work order may move from one status to another.
func CanTransition(from, to Status) bool {
	for _, s := range transitions[from] {
		if s == to {
			return true
		}
	}
	return false
}

// ParseStatus returns the Status that matches s, or an error.
func ParseStatus(s string) (Status, error) {
	for _, st := range Statuses {
		if strings.EqualFold(string(st), s) {
			return st, nil
		}
	}
	return "", fmt.Errorf("unknown status %q", s)
}

// ErrInvalid marks a validation failure.
var ErrInvalid = errors.New("invalid work order")

func invalid(msg string) error { return fmt.Errorf("%w: %s", ErrInvalid, msg) }

// ValidateExpense checks the provider-supplied expense details.
func ValidateExpense(e Expense) error {
	switch e.Category {
	case ExpenseParts, ExpenseMileage, ExpenseTools, ExpenseOther:
	default:
		return invalid(fmt.Sprintf("unknown expense category %q", e.Category))
	}
	if strings.TrimSpace(e.Description) == "" {
		return invalid("expense description is required")
	}
	if utf8.RuneCountInString(e.Description) > 200 {
		return invalid("expense description must not exceed 200 characters")
	}
	if e.AmountCents < 1 || e.AmountCents > 500000 {
		return invalid("expense amount must be between 1 and 500000 cents")
	}
	return nil
}

// ValidateRejectReason checks the buyer's reason for rejecting an expense.
func ValidateRejectReason(reason string) error {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return invalid("rejection reason is required")
	}
	if utf8.RuneCountInString(reason) > 200 {
		return invalid("rejection reason must not exceed 200 characters")
	}
	return nil
}

// ValidatePay checks the pay terms.
func ValidatePay(p Pay) error {
	if p.Rate <= 0 {
		return invalid("pay rate must be greater than zero")
	}
	switch p.Type {
	case PayFixed:
	case PayHourly:
		if p.Hours <= 0 {
			return invalid("hourly pay needs hours")
		}
	case PayPerDevice:
		if p.Devices <= 0 {
			return invalid("per device pay needs devices")
		}
	case PayBlended:
	default:
		return invalid(fmt.Sprintf("unknown pay type %q", p.Type))
	}
	return nil
}

// ValidateNew checks a work order before it is created. Drafts need only
// a title. Published work orders need schedule, location and pay.
func ValidateNew(w WorkOrder) error {
	if strings.TrimSpace(w.Title) == "" {
		return invalid("title is required")
	}
	if w.Status != StatusDraft && w.Status != StatusPublished {
		return invalid("new work orders must be Draft or Published")
	}
	if w.Status == StatusDraft {
		return nil
	}
	if w.TypeOfWork == "" {
		return invalid("type of work is required to publish")
	}
	if w.Location.City == "" || w.Location.State == "" {
		return invalid("location is required to publish")
	}
	if w.Schedule == nil || w.Schedule.Start.IsZero() || w.Schedule.End.IsZero() {
		return invalid("schedule is required to publish")
	}
	if w.Schedule.End.Before(w.Schedule.Start) {
		return invalid("schedule end must be after start")
	}
	if w.Schedule.End.Sub(w.Schedule.Start) > 14*24*time.Hour {
		return invalid("schedule must not span more than 14 days")
	}
	return ValidatePay(w.Pay)
}
