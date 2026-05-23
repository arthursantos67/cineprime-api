"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import { getApiErrorUserMessage } from "@/api/client";
import { ticketsApi } from "@/api/tickets";
import type { UserTicket } from "@/types/ticket";

import {
  getTicketFilterFromSearchParams,
  MyTicketsContent,
  type MyTicketsStatus,
} from "./my-tickets";

type MyTicketsState = {
  errorMessage?: string;
  status: MyTicketsStatus;
  tickets: UserTicket[];
};

export function MyTicketsClient() {
  const searchParams = useSearchParams();
  const activeFilter = useMemo(
    () => getTicketFilterFromSearchParams(searchParams),
    [searchParams]
  );
  const [retryCount, setRetryCount] = useState(0);
  const [state, setState] = useState<MyTicketsState>({
    status: "loading",
    tickets: [],
  });

  useEffect(() => {
    const abortController = new AbortController();

    setState({ status: "loading", tickets: [] });

    ticketsApi
      .listMyTickets(
        activeFilter ? { type: activeFilter } : {},
        { signal: abortController.signal }
      )
      .then((response) => {
        setState({
          status: "success",
          tickets: response.results,
        });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        setState({
          errorMessage: getApiErrorUserMessage(error),
          status: "error",
          tickets: [],
        });
      });

    return () => {
      abortController.abort();
    };
  }, [activeFilter, retryCount]);

  const handleRetry = useCallback(() => {
    setRetryCount((current) => current + 1);
  }, []);

  return (
    <MyTicketsContent
      activeFilter={activeFilter}
      errorMessage={state.errorMessage}
      onRetry={handleRetry}
      status={state.status}
      tickets={state.tickets}
    />
  );
}
