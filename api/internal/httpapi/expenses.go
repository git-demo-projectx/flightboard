package httpapi

import (
	"net/http"

	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

type newExpenseRequest struct {
	Category    workorder.ExpenseCategory `json:"category"`
	Description string                    `json:"description"`
	AmountCents int                       `json:"amountCents"`
}

func (s *Server) createExpense(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in newExpenseRequest
	if !readJSON(w, r, &in) {
		return
	}
	expense, err := s.store.AddExpense(id, workorder.Expense{
		Category: in.Category, Description: in.Description, AmountCents: in.AmountCents,
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, expense)
}

func (s *Server) decideExpense(w http.ResponseWriter, r *http.Request, status workorder.ExpenseStatus) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	expense, err := s.store.DecideExpense(id, r.PathValue("expenseId"), status, in.Reason)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, expense)
}

func (s *Server) approveExpense(w http.ResponseWriter, r *http.Request) {
	s.decideExpense(w, r, workorder.ExpenseApproved)
}

func (s *Server) rejectExpense(w http.ResponseWriter, r *http.Request) {
	s.decideExpense(w, r, workorder.ExpenseRejected)
}
