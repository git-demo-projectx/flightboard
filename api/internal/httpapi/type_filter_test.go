package httpapi

import (
	"net/http"
	"slices"
	"testing"
)

func TestListWorkOrdersTypeOfWorkFilter(t *testing.T) {
	allIDs := make([]int, 25)
	for i := range allIDs {
		allIDs[i] = 9631825 - i
	}
	s := newTestServer(t)
	for _, tt := range []struct {
		name  string
		query string
		want  []int
	}{
		{name: "missing type", want: allIDs},
		{name: "empty type", query: "?typeOfWork=", want: allIDs},
		{
			name: "lowercase type", query: "?typeOfWork=networking",
			want: []int{9631824, 9631820, 9631810, 9631802},
		},
		{
			name: "mixed case type", query: "?typeOfWork=nEtWoRkInG",
			want: []int{9631824, 9631820, 9631810, 9631802},
		},
		{name: "unknown type", query: "?typeOfWork=Plumbing", want: []int{}},
		{
			name: "with status", query: "?typeOfWork=Networking&status=Assigned",
			want: []int{9631810},
		},
		{
			name: "with provider", query: "?typeOfWork=Networking&providerId=p-101",
			want: []int{9631810},
		},
		{
			name: "with status and provider", query: "?typeOfWork=Networking&status=Assigned&providerId=p-101",
			want: []int{9631810},
		},
		{
			name: "nonmatching provider", query: "?typeOfWork=Networking&status=Assigned&providerId=p-103",
			want: []int{},
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, s, "GET", "/api/work-orders"+tt.query, "")
			if rec.Code != http.StatusOK {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			list := decode[[]woJSON](t, rec)
			got := make([]int, len(list))
			for i, wo := range list {
				got[i] = wo.ID
			}
			if !slices.Equal(got, tt.want) {
				t.Errorf("ids = %v, want %v", got, tt.want)
			}
			if len(tt.want) == 0 && rec.Body.String() != "[]\n" {
				t.Errorf("body = %q, want %q", rec.Body.String(), "[]\n")
			}
		})
	}
}
