package httpapi

import (
	"encoding/csv"
	"net/http"
	"net/http/httptest"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/git-demo-projectx/flightboard/api/internal/workorder"
)

func readExport(t *testing.T, rec *httptest.ResponseRecorder) [][]string {
	t.Helper()
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d body %s", rec.Code, rec.Body)
	}
	rows, err := csv.NewReader(rec.Body).ReadAll()
	if err != nil {
		t.Fatalf("read CSV: %v", err)
	}
	return rows
}

func TestCSVText(t *testing.T) {
	for _, tt := range []struct{ in, want string }{
		{"", ""}, {"Networking", "Networking"}, {"=1+1", "'=1+1"},
		{"+1", "'+1"}, {"-1", "'-1"}, {"@SUM(A1)", "'@SUM(A1)"},
		{"\t=1", "'\t=1"}, {"\r=1", "'\r=1"}, {"a=b", "a=b"}, {"'quoted", "'quoted"},
	} {
		t.Run(tt.in, func(t *testing.T) {
			if got := csvText(tt.in); got != tt.want {
				t.Errorf("csvText(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestExportWorkOrders(t *testing.T) {
	rec := do(t, newTestServer(t), "GET", "/api/work-orders/export", "")
	if got := rec.Header().Get("Content-Type"); got != "text/csv; charset=utf-8" {
		t.Errorf("Content-Type = %q", got)
	}
	if got := rec.Header().Get("Content-Disposition"); got != `attachment; filename="work-orders.csv"` {
		t.Errorf("Content-Disposition = %q", got)
	}
	rows := readExport(t, rec)
	if len(rows) != 26 {
		t.Fatalf("records = %d, want 26", len(rows))
	}
	wantHeader := []string{"id", "title", "typeOfWork", "status", "subStatus", "buyer", "provider", "city", "state", "scheduleStart", "scheduleEnd", "payType", "payRate", "health"}
	if !slices.Equal(rows[0], wantHeader) {
		t.Errorf("header = %q, want %q", rows[0], wantHeader)
	}
	wantFirst := []string{"9631825", "Self-checkout lane install", "Point of Sale", "Cancelled", "", "Northwind Retail", "",
		"Plymouth", "MN", "2026-10-29T08:00:00-05:00", "2026-10-29T16:00:00-05:00", "PerDevice", "60.00", "On Track"}
	if !slices.Equal(rows[1], wantFirst) {
		t.Errorf("first row = %q, want %q", rows[1], wantFirst)
	}
	for i, row := range rows[1:] {
		if want := strconv.Itoa(9631825 - i); row[0] != want {
			t.Errorf("row %d id = %s, want %s", i, row[0], want)
		}
		if row[0] == "9631810" && (row[4] != "Checked In" || row[6] != "Dana Whitfield" || row[12] != "65.00") {
			t.Errorf("work order 9631810 = %q", row)
		}
	}
}

func TestExportWorkOrdersFilters(t *testing.T) {
	s := newTestServer(t)
	for _, tt := range []struct {
		query string
		ids   []string
	}{
		{"?status=Draft", []string{"9631803", "9631802", "9631801"}},
		{"?typeOfWork=networking", []string{"9631824", "9631820", "9631810", "9631802"}},
		{"?providerId=p-101", []string{"9631823", "9631817", "9631810"}},
		{"?status=assigned&providerId=p-101&typeOfWork=networking", []string{"9631810"}},
		{"?providerId=unknown", []string{}},
	} {
		t.Run(tt.query, func(t *testing.T) {
			rows := readExport(t, do(t, s, "GET", "/api/work-orders/export"+tt.query, ""))
			ids := make([]string, 0, len(rows)-1)
			for _, row := range rows[1:] {
				ids = append(ids, row[0])
				if tt.query == "?status=Draft" && row[3] != "Draft" {
					t.Errorf("status = %q, want Draft", row[3])
				}
			}
			if !slices.Equal(ids, tt.ids) {
				t.Errorf("ids = %v, want %v", ids, tt.ids)
			}
		})
	}
	rec := do(t, s, "GET", "/api/work-orders/export?status=Lost", "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("code = %d body %s", rec.Code, rec.Body)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q", got)
	}
	if got := rec.Header().Get("Content-Disposition"); got != "" {
		t.Errorf("unexpected Content-Disposition = %q", got)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != `{"error":"unknown status \"Lost\""}` {
		t.Errorf("body = %q", got)
	}
}

func TestExportWorkOrdersNeutralizesFormulas(t *testing.T) {
	s := newTestServer(t)
	wo, err := s.store.CreateWorkOrder(workorder.WorkOrder{
		Title: `=HYPERLINK("https://example.test","open")`, Status: workorder.StatusDraft,
		Buyer: "@buyer", Location: workorder.Location{City: "+city"},
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder: %v", err)
	}
	rows := readExport(t, do(t, s, "GET", "/api/work-orders/export?status=Draft", ""))
	if len(rows) != 5 {
		t.Fatalf("records = %d, want 5", len(rows))
	}
	row := rows[1]
	if row[0] != strconv.Itoa(wo.ID) || row[1] != `'=HYPERLINK("https://example.test","open")` || row[5] != "'@buyer" || row[7] != "'+city" {
		t.Errorf("created row = %q", row)
	}
	if row[9] != "" || row[10] != "" {
		t.Errorf("unscheduled row has schedule = %q", row[9:11])
	}
}

func TestExportWorkOrdersQuotesText(t *testing.T) {
	s := newTestServer(t)
	wo, err := s.store.CreateWorkOrder(workorder.WorkOrder{
		Title: `Rack, stack "and" label`, TypeOfWork: "Line one\nLine two", Status: workorder.StatusDraft,
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder: %v", err)
	}
	rows := readExport(t, do(t, s, "GET", "/api/work-orders/export?status=Draft", ""))
	if len(rows) != 5 {
		t.Fatalf("records = %d, want 5", len(rows))
	}
	if row := rows[1]; row[0] != strconv.Itoa(wo.ID) || row[1] != wo.Title || row[2] != wo.TypeOfWork {
		t.Errorf("created row = %q", row)
	}
}

func TestExportRowNeutralizesAllTextFields(t *testing.T) {
	row := exportRow(workorder.WorkOrder{
		Title: "=title", TypeOfWork: "\ttype", Buyer: "@buyer",
		Location: workorder.Location{City: "+city", State: "\rstate"},
	}, "-provider")
	for i, want := range map[int]string{1: "'=title", 2: "'\ttype", 5: "'@buyer", 6: "'-provider", 7: "'+city", 8: "'\rstate"} {
		if row[i] != want {
			t.Errorf("cell %d = %q, want %q", i, row[i], want)
		}
	}
}
