package store

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

func TestMarkPaid(t *testing.T) {
	s := seeded(t)
	at := time.Date(2026, 10, 23, 20, 15, 4, 0, time.UTC)
	ids := []int{9631822, 9631821}
	// Keep a sub-status to verify that the pay run clears it.
	w := s.workOrders[ids[0]]
	w.SubStatus = workorder.SubCheckedOut
	s.workOrders[ids[0]] = w
	got, err := s.MarkPaid(ids, at)
	if err != nil {
		t.Fatalf("MarkPaid: %v", err)
	}
	if len(got) != len(ids) {
		t.Fatalf("got %d work orders, want %d", len(got), len(ids))
	}
	for i, w := range got {
		if w.ID != ids[i] || w.Status != workorder.StatusPaid || w.SubStatus != "" || !w.PaidAt.Equal(at) {
			t.Errorf("result at index %d = %+v", i, w)
		}
		stored, err := s.GetWorkOrder(ids[i])
		if err != nil || !reflect.DeepEqual(stored, w) {
			t.Fatalf("stored work order = %+v, err = %v, want %+v", stored, err, w)
		}
	}
	before, err := s.GetWorkOrder(ids[0])
	if err != nil {
		t.Fatal(err)
	}
	got[0].Title = "changed"
	got[0].Status = workorder.StatusDraft
	got[0].PaidAt = time.Time{}
	got[0].Tasks[0].Title = "changed task"
	if got[0].Schedule != nil {
		got[0].Schedule.Start = time.Time{}
	}
	if got[0].CheckIn != nil {
		*got[0].CheckIn = time.Time{}
	}
	if got[0].CheckOut != nil {
		*got[0].CheckOut = time.Time{}
	}
	after, err := s.GetWorkOrder(ids[0])
	if err != nil || !reflect.DeepEqual(after, before) {
		t.Fatalf("caller mutation changed store: %+v, err = %v", after, err)
	}
	if _, err := s.MarkPaid(ids[:1], at.Add(time.Hour)); !errors.Is(err, ErrConflict) {
		t.Fatalf("repeat run err = %v, want ErrConflict", err)
	}
	after, err = s.GetWorkOrder(ids[0])
	if err != nil || !reflect.DeepEqual(after, before) {
		t.Fatalf("repeat run changed store: %+v, err = %v", after, err)
	}
}

func TestMarkPaidAllOrNothing(t *testing.T) {
	for _, tt := range []struct {
		name string
		ids  []int
		err  error
		msg  string
	}{
		{"unknown id", []int{9631821, 9999999}, ErrNotFound, "not found: work order 9999999"},
		{"not approved", []int{9631821, 9631818}, ErrConflict, "conflict: work order 9631818 is Work Done, not Approved"},
		{"first error in request order", []int{9631822, 9631818, 9999999}, ErrConflict, "conflict: work order 9631818 is Work Done, not Approved"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s := seeded(t)
			before := s.ListWorkOrders(Filter{})
			got, err := s.MarkPaid(tt.ids, time.Now().UTC())
			if !errors.Is(err, tt.err) || err.Error() != tt.msg || got != nil {
				t.Fatalf("MarkPaid = %+v, %v; want nil, %s", got, err, tt.msg)
			}
			if after := s.ListWorkOrders(Filter{}); !reflect.DeepEqual(after, before) {
				t.Fatal("failed pay run changed the store")
			}
		})
	}
}
