package store

import (
	"fmt"
	"time"

	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

// MarkPaid marks approved work orders Paid atomically, in request order.
func (s *Store) MarkPaid(ids []int, at time.Time) ([]workorder.WorkOrder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, id := range ids {
		w, ok := s.workOrders[id]
		if !ok {
			return nil, fmt.Errorf("%w: work order %d", ErrNotFound, id)
		}
		if w.Status != workorder.StatusApproved {
			return nil, fmt.Errorf("%w: work order %d is %s, not Approved", ErrConflict, id, w.Status)
		}
	}

	out := make([]workorder.WorkOrder, 0, len(ids))
	for _, id := range ids {
		w := s.workOrders[id]
		w.Status = workorder.StatusPaid
		w.SubStatus = ""
		w.PaidAt = at
		s.workOrders[id] = w
		out = append(out, clone(w))
	}
	return out, nil
}
