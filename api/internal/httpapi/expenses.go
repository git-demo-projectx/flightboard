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
