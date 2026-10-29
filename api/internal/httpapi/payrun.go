package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/git-demo-projectx/flightboard/api/internal/store"
	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

type payRunView struct {
	Count      int          `json:"count"`
	PaidAt     time.Time    `json:"paidAt"`
	WorkOrders []payRunItem `json:"workOrders"`
}

type payRunItem struct {
	ID     int              `json:"id"`
	Title  string           `json:"title"`
	Status workorder.Status `json:"status"`
	PaidAt time.Time        `json:"paidAt"`
}

func (s *Server) payRun(w http.ResponseWriter, r *http.Request) {
	var in struct {
		IDs []int `json:"ids"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if len(in.IDs) < 1 || len(in.IDs) > 50 {
		writeError(w, http.StatusBadRequest, "ids must list 1 to 50 work orders")
		return
	}
	seen := make(map[int]bool, len(in.IDs))
	for _, id := range in.IDs {
		if seen[id] {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("duplicate work order %d", id))
			return
		}
		seen[id] = true
	}

	at := time.Now().UTC().Truncate(time.Second)
	orders, err := s.store.MarkPaid(in.IDs, at)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, err.Error())
		} else {
			writeStoreError(w, err)
		}
		return
	}
	out := payRunView{Count: len(orders), PaidAt: at, WorkOrders: make([]payRunItem, 0, len(orders))}
	for _, wo := range orders {
		out.WorkOrders = append(out.WorkOrders, payRunItem{ID: wo.ID, Title: wo.Title, Status: wo.Status, PaidAt: wo.PaidAt})
	}
	writeJSON(w, http.StatusOK, out)
}
