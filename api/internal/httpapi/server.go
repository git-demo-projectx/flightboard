// Package httpapi exposes the store as a REST+JSON API under /api.
package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"strconv"
	"time"

	"github.com/git-demo-projectx/flightboard/api/internal/store"
	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

// Server serves the Flightboard API.
type Server struct {
	store *store.Store
	mux   *http.ServeMux
}

// New returns a Server backed by st.
func New(st *store.Store) *Server {
	s := &Server{store: st, mux: http.NewServeMux()}
	s.routes()
	return s
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /api/health", s.health)
	s.mux.HandleFunc("GET /api/work-orders", s.listWorkOrders)
	s.mux.HandleFunc("POST /api/work-orders", s.createWorkOrder)
	s.mux.HandleFunc("GET /api/work-orders/summary", s.workOrderSummary)
	s.mux.HandleFunc("GET /api/work-orders/week", s.workOrderWeek)
	s.mux.HandleFunc("GET /api/work-orders/{id}", s.getWorkOrder)
	s.mux.HandleFunc("GET /api/work-orders/{id}/progress", s.workOrderProgress)
	s.mux.HandleFunc("GET /api/work-orders/{id}/nearby-providers", s.workOrderNearbyProviders)
	s.mux.HandleFunc("GET /api/work-orders/{id}/expenses", s.workOrderExpenses)
	s.mux.HandleFunc("POST /api/work-orders/{id}/expenses", s.createExpense)
	s.mux.HandleFunc("POST /api/work-orders/{id}/status", s.setStatus)
	s.mux.HandleFunc("POST /api/work-orders/{id}/check-in", s.checkIn)
	s.mux.HandleFunc("POST /api/work-orders/{id}/check-out", s.checkOut)
	s.mux.HandleFunc("POST /api/work-orders/pay-run", s.payRun)
	s.mux.HandleFunc("PATCH /api/work-orders/{id}/tasks/{taskId}", s.updateTask)
	s.mux.HandleFunc("GET /api/providers", s.listProviders)
	s.mux.HandleFunc("GET /api/providers/{id}", s.getProvider)
}

// ServeHTTP implements http.Handler.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

// workOrderView is a work order with its provider expanded and expense totals.
type workOrderView struct {
	workorder.WorkOrder
	Provider      *workorder.Provider `json:"provider"`
	ExpenseTotals expenseTotals       `json:"expenseTotals"`
	PaidAt        time.Time           `json:"paidAt,omitzero"`
}

type expenseTotals struct {
	Count         int `json:"count"`
	PendingCents  int `json:"pendingCents"`
	ApprovedCents int `json:"approvedCents"`
	RejectedCents int `json:"rejectedCents"`
}

func totalsForExpenses(expenses []workorder.Expense) expenseTotals {
	out := expenseTotals{Count: len(expenses)}
	for _, expense := range expenses {
		switch expense.Status {
		case workorder.ExpensePending:
			out.PendingCents += expense.AmountCents
		case workorder.ExpenseApproved:
			out.ApprovedCents += expense.AmountCents
		case workorder.ExpenseRejected:
			out.RejectedCents += expense.AmountCents
		}
	}
	return out
}

func (s *Server) view(w workorder.WorkOrder) workOrderView {
	v := workOrderView{WorkOrder: w, ExpenseTotals: totalsForExpenses(w.Expenses)}
	v.PaidAt = w.PaidAt
	if w.ProviderID != "" {
		if p, err := s.store.GetProvider(w.ProviderID); err == nil {
			v.Provider = &p
		}
	}
	return v
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "flightboard-api"})
}

func (s *Server) listWorkOrders(w http.ResponseWriter, r *http.Request) {
	var f store.Filter
	if v := r.URL.Query().Get("status"); v != "" {
		st, err := workorder.ParseStatus(v)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		f.Status = st
	}
	f.ProviderID = r.URL.Query().Get("providerId")
	f.TypeOfWork = r.URL.Query().Get("typeOfWork")

	list := s.store.ListWorkOrders(f)
	out := make([]workOrderView, 0, len(list))
	for _, wo := range list {
		out = append(out, s.view(wo))
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) workOrderSummary(w http.ResponseWriter, _ *http.Request) {
	list := s.store.ListWorkOrders(store.Filter{})
	out := struct {
		Total           int                      `json:"total"`
		ByStatus        map[workorder.Status]int `json:"byStatus"`
		PendingExpenses int                      `json:"pendingExpenses"`
	}{Total: len(list), ByStatus: make(map[workorder.Status]int, len(workorder.Statuses))}
	for _, status := range workorder.Statuses {
		out.ByStatus[status] = 0
	}
	for _, wo := range list {
		out.ByStatus[wo.Status]++
		for _, expense := range wo.Expenses {
			if expense.Status == workorder.ExpensePending {
				out.PendingExpenses++
				break
			}
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) getWorkOrder(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	wo, err := s.store.GetWorkOrder(id)
	s.respond(w, http.StatusOK, wo, err)
}

func (s *Server) workOrderExpenses(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	expenses, err := s.store.Expenses(id)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	slices.SortStableFunc(expenses, func(a, b workorder.Expense) int {
		return b.CreatedAt.Compare(a.CreatedAt)
	})
	writeJSON(w, http.StatusOK, expenses)
}

type taskCounts struct {
	Done  int `json:"done"`
	Total int `json:"total"`
}

type taskProgress struct {
	Done    int                                `json:"done"`
	Total   int                                `json:"total"`
	Percent int                                `json:"percent"`
	Groups  map[workorder.TaskGroup]taskCounts `json:"groups"`
}

func progressForTasks(tasks []workorder.Task) taskProgress {
	out := taskProgress{
		Total: len(tasks),
		Groups: map[workorder.TaskGroup]taskCounts{
			workorder.TaskPrep: {}, workorder.TaskOnSite: {}, workorder.TaskPost: {},
		},
	}
	for _, task := range tasks {
		counts := out.Groups[task.Group]
		counts.Total++
		if task.Done {
			counts.Done++
			out.Done++
		}
		out.Groups[task.Group] = counts
	}
	if out.Total > 0 {
		out.Percent = out.Done * 100 / out.Total
	}
	return out
}

func (s *Server) workOrderProgress(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	wo, err := s.store.GetWorkOrder(id)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, progressForTasks(wo.Tasks))
}

func (s *Server) createWorkOrder(w http.ResponseWriter, r *http.Request) {
	var in workorder.WorkOrder
	if !readJSON(w, r, &in) {
		return
	}
	wo, err := s.store.CreateWorkOrder(in)
	s.respond(w, http.StatusCreated, wo, err)
}

func (s *Server) setStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Status string `json:"status"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	st, err := workorder.ParseStatus(in.Status)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	wo, err := s.store.SetStatus(id, st)
	s.respond(w, http.StatusOK, wo, err)
}

// timeRequest is the body for check-in and check-out. An empty time means now.
type timeRequest struct {
	Time time.Time `json:"time"`
}

func (s *Server) checkIn(w http.ResponseWriter, r *http.Request) {
	s.recordTime(w, r, s.store.CheckIn)
}

func (s *Server) checkOut(w http.ResponseWriter, r *http.Request) {
	s.recordTime(w, r, s.store.CheckOut)
}

func (s *Server) recordTime(w http.ResponseWriter, r *http.Request, record func(int, time.Time) (workorder.WorkOrder, error)) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in timeRequest
	if !readJSON(w, r, &in) {
		return
	}
	if in.Time.IsZero() {
		in.Time = time.Now()
	}
	wo, err := record(id, in.Time)
	s.respond(w, http.StatusOK, wo, err)
}

func (s *Server) updateTask(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Done bool `json:"done"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	wo, err := s.store.SetTaskDone(id, r.PathValue("taskId"), in.Done)
	s.respond(w, http.StatusOK, wo, err)
}

func (s *Server) listProviders(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.store.ListProviders())
}

func (s *Server) getProvider(w http.ResponseWriter, r *http.Request) {
	p, err := s.store.GetProvider(r.PathValue("id"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// respond writes the work order view on success or maps err to a status code.
func (s *Server) respond(w http.ResponseWriter, code int, wo workorder.WorkOrder, err error) {
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, code, s.view(wo))
}

func pathID(w http.ResponseWriter, r *http.Request) (int, bool) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a number")
		return 0, false
	}
	return id, true
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return false
	}
	return true
}

func writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "not found")
	case errors.Is(err, store.ErrConflict), errors.Is(err, store.ErrPendingExpenses):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, workorder.ErrInvalid):
		writeError(w, http.StatusBadRequest, err.Error())
	default:
		slog.Error("request failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
	}
}

func writeError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("encode response", "err", err)
	}
}
