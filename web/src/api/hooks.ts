import { useCallback, useEffect, useRef, useState } from 'react'
import { api, payApi } from './client'
import type { Adjustment, Pay, PayQuote, WorkOrder, WorkOrderWeek } from './types'

export interface AsyncState<T> {
  data: T | null
  error: Error | null
  loading: boolean
  reload: () => void
  setData: (data: T) => void
}

/**
 * useAsync runs load() on mount and whenever key changes. Pass a key that
 * captures every input of load (for example the work order id).
 */
export function useAsync<T>(load: () => Promise<T>, key: string): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loadRef
      .current()
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [key, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, error, loading, reload, setData }
}

export function useWorkOrders() {
  return useAsync<WorkOrder[]>(api.listWorkOrders, 'work-orders')
}

export function useWorkOrder(id: number) {
  return useAsync<WorkOrder>(() => api.getWorkOrder(id), `work-order-${id}`)
}

export function useWeek(start: string, providerId?: string) {
  return useAsync<WorkOrderWeek>(() => api.getWeek(start, providerId), `week-${start}-${providerId ?? ''}`)
}

export function usePayQuote(pay: Pay, adjustments?: Adjustment[]) {
  return useAsync<PayQuote>(
    () => adjustments === undefined ? payApi.quote(pay) : payApi.quote(pay, undefined, adjustments),
    JSON.stringify({ pay, adjustments }),
  )
}

export function useNearbyProviders(workOrderId: number) {
  return useAsync(() => api.nearbyProviders(workOrderId), `nearby-providers-${workOrderId}`)
}
