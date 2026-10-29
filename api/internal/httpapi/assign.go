package httpapi

import "net/http"

func (s *Server) assignProvider(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		ProviderID string `json:"providerId"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	wo, err := s.store.AssignProvider(id, in.ProviderID)
	s.respond(w, http.StatusOK, wo, err)
}
