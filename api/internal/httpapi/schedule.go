package httpapi

import (
	"net/http"

	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

func (s *Server) rescheduleWorkOrder(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var sc workorder.Schedule
	if !readJSON(w, r, &sc) {
		return
	}
	wo, err := s.store.Reschedule(id, sc)
	s.respond(w, http.StatusOK, wo, err)
}
