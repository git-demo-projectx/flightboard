package httpapi

import (
	"cmp"
	"net/http"
	"slices"
	"time"

	"github.com/git-demo-projectx/flightboard/api/internal/store"
	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

type weekView struct {
	Start      string    `json:"start"`
	End        string    `json:"end"`
	Total      int       `json:"total"`
	Unassigned int       `json:"unassigned"`
	Days       []weekDay `json:"days"`
}

type weekDay struct {
	Date       string     `json:"date"`
	Total      int        `json:"total"`
	Unassigned int        `json:"unassigned"`
	WorkOrders []weekItem `json:"workOrders"`
}

type weekItem struct {
	ID        int                 `json:"id"`
	Title     string              `json:"title"`
	Status    workorder.Status    `json:"status"`
	SubStatus workorder.SubStatus `json:"subStatus,omitempty"`
	Health    workorder.Health    `json:"health"`
	Start     time.Time           `json:"start"`
	End       time.Time           `json:"end"`
	Location  workorder.Location  `json:"location"`
	Provider  *weekProvider       `json:"provider"`
}

type weekProvider struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func buildWeek(start time.Time, list []workorder.WorkOrder, providers map[string]workorder.Provider) weekView {
	out := weekView{
		Start: start.Format(time.DateOnly),
		End:   start.AddDate(0, 0, 6).Format(time.DateOnly),
		Days:  make([]weekDay, 7),
	}
	dayIndexes := make(map[string]int, 7)
	for i := range out.Days {
		date := start.AddDate(0, 0, i).Format(time.DateOnly)
		out.Days[i] = weekDay{Date: date, WorkOrders: make([]weekItem, 0)}
		dayIndexes[date] = i
	}
	for _, wo := range list {
		if wo.Schedule == nil || wo.Status == workorder.StatusCancelled {
			continue
		}
		i, ok := dayIndexes[wo.Schedule.Start.Format(time.DateOnly)]
		if !ok {
			continue
		}
		item := weekItem{
			ID: wo.ID, Title: wo.Title, Status: wo.Status, SubStatus: wo.SubStatus,
			Health: wo.Health, Start: wo.Schedule.Start, End: wo.Schedule.End,
			Location: wo.Location,
		}
		if p, ok := providers[wo.ProviderID]; wo.ProviderID != "" && ok {
			item.Provider = &weekProvider{ID: p.ID, Name: p.Name}
		}
		day := &out.Days[i]
		day.WorkOrders = append(day.WorkOrders, item)
		day.Total++
		out.Total++
		if item.Provider == nil {
			day.Unassigned++
			out.Unassigned++
		}
	}
	for i := range out.Days {
		slices.SortFunc(out.Days[i].WorkOrders, func(a, b weekItem) int {
			if c := a.Start.Compare(b.Start); c != 0 {
				return c
			}
			return cmp.Compare(a.ID, b.ID)
		})
	}
	return out
}

func (s *Server) workOrderWeek(w http.ResponseWriter, r *http.Request) {
	start, err := time.Parse(time.DateOnly, r.URL.Query().Get("start"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "start must be a date like 2026-10-19")
		return
	}
	list := s.store.ListWorkOrders(store.Filter{ProviderID: r.URL.Query().Get("providerId")})
	providers := make(map[string]workorder.Provider)
	for _, p := range s.store.ListProviders() {
		providers[p.ID] = p
	}
	writeJSON(w, http.StatusOK, buildWeek(start, list, providers))
}
