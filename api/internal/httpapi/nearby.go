package httpapi

import (
	"net/http"
	"strings"

	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

func (s *Server) workOrderNearbyProviders(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	wo, err := s.store.GetWorkOrder(id)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, nearbyProviders(wo, s.store.ListProviders()))
}

func nearbyProviders(wo workorder.WorkOrder, providers []workorder.Provider) []workorder.Provider {
	out := make([]workorder.Provider, 0, len(providers))
	for _, provider := range providers {
		if strings.EqualFold(provider.State, wo.Location.State) && provider.ID != wo.ProviderID {
			out = append(out, provider)
		}
	}
	return out
}
