package httpapi

import (
	"encoding/csv"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

var exportHeader = []string{"id", "title", "typeOfWork", "status", "subStatus", "buyer", "provider", "city", "state", "scheduleStart", "scheduleEnd", "payType", "payRate", "health"}

func csvText(s string) string {
	if s != "" {
		switch s[0] {
		case '=', '+', '-', '@', '\t', '\r':
			return "'" + s
		}
	}
	return s
}

func exportRow(wo workorder.WorkOrder, providerName string) []string {
	var start, end string
	if wo.Schedule != nil {
		start = wo.Schedule.Start.Format(time.RFC3339)
		end = wo.Schedule.End.Format(time.RFC3339)
	}
	return []string{
		strconv.Itoa(wo.ID), csvText(wo.Title), csvText(wo.TypeOfWork),
		string(wo.Status), string(wo.SubStatus), csvText(wo.Buyer), csvText(providerName),
		csvText(wo.Location.City), csvText(wo.Location.State), start, end,
		string(wo.Pay.Type), strconv.FormatFloat(wo.Pay.Rate, 'f', 2, 64), string(wo.Health),
	}
}

func (s *Server) exportWorkOrders(w http.ResponseWriter, r *http.Request) {
	f, err := parseFilter(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	list := s.store.ListWorkOrders(f)
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="work-orders.csv"`)
	w.WriteHeader(http.StatusOK)

	writer := csv.NewWriter(w)
	// csv.Writer retains write errors for the final Error check after Flush.
	_ = writer.Write(exportHeader)
	for _, wo := range list {
		var providerName string
		if wo.ProviderID != "" {
			if p, err := s.store.GetProvider(wo.ProviderID); err == nil {
				providerName = p.Name
			}
		}
		_ = writer.Write(exportRow(wo, providerName))
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		slog.Error("write export", "err", err)
	}
}
