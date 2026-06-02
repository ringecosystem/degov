/**
 * GraphQL error handling utilities
 */

/**
 * Check if an error indicates authentication is required
 * Handles both HTTP 401 responses and GraphQL errors with "authentication required" message
 */
export const isAuthenticationRequired = (error: unknown): boolean => {
  // Check for 401 status code
  const status =
    error && typeof error === "object" && "response" in error
      ? (error as { response?: { status?: number } }).response?.status
      : undefined;

  if (status === 401) return true;

  // Check for GraphQL errors with "authentication required" message
  if (error && typeof error === "object") {
    // Handle GraphQL Client errors
    if (
      "response" in error &&
      error.response &&
      typeof error.response === "object"
    ) {
      const response = error.response as { errors?: { message?: string }[] };
      if (response.errors && Array.isArray(response.errors)) {
        return response.errors.some(
          (err) =>
            err.message &&
            typeof err.message === "string" &&
            err.message.toLowerCase().includes("authentication required")
        );
      }
    }
    // Handle direct GraphQL error format
    if ("errors" in error && Array.isArray(error.errors)) {
      const errors = error.errors as { message?: string }[];
      return errors.some(
        (err) =>
          err.message &&
          typeof err.message === "string" &&
          err.message.toLowerCase().includes("authentication required")
      );
    }
  }

  return false;
};

/**
 * Extract error message from GraphQL error response
 * @param error - The error object from GraphQL response
 * @returns The first error message found, or undefined if no message exists
 */
export const extractErrorMessage = (error: unknown): string | undefined => {
  return error && typeof error === "object" && "response" in error
    ? (error as { response?: { errors?: { message?: string }[] } }).response
        ?.errors?.[0]?.message
    : undefined;
};
