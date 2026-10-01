using FluentValidation;

namespace Api.Common;

public static class ValidationExtensions
{
    /// <summary>
    /// Validates a DTO that an action builds itself from several [FromQuery] parameters. The global
    /// ValidationFilter only sees action ARGUMENTS, so such DTOs were never validated - which silently
    /// disabled their page-size caps (a request for pageSize=2000000000 returned the whole table).
    /// Returns null when valid, otherwise the error messages.
    /// </summary>
    public static async Task<List<string>?> ValidateOrNullAsync<T>(this IValidator<T> validator, T value, CancellationToken cancellationToken)
    {
        var result = await validator.ValidateAsync(value, cancellationToken);
        return result.IsValid ? null : result.Errors.Select(e => e.ErrorMessage).ToList();
    }
}
