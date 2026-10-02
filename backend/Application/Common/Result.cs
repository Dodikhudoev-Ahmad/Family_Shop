namespace Application.Common;

public class Result<T>
{
    public bool IsSuccess { get; }
    public T? Value { get; }
    public IReadOnlyList<string> Errors { get; }

    /// <summary>Machine-readable kind of failure (see <see cref="ResultErrorCodes"/>) so controllers can pick an HTTP
    /// status other than 400; null for ordinary validation-style failures.</summary>
    public string? ErrorCode { get; }

    private Result(bool isSuccess, T? value, IReadOnlyList<string> errors, string? errorCode = null)
    {
        IsSuccess = isSuccess;
        Value = value;
        Errors = errors;
        ErrorCode = errorCode;
    }

    public static Result<T> Success(T value) => new(true, value, Array.Empty<string>());
    public static Result<T> Failure(string error) => new(false, default, new[] { error });
    public static Result<T> Failure(IReadOnlyList<string> errors) => new(false, default, errors);
    public static Result<T> Failure(string error, string errorCode) => new(false, default, new[] { error }, errorCode);
}

public static class ResultErrorCodes
{
    /// <summary>Not enough stock (or the stock was taken by a concurrent order) - maps to 409.</summary>
    public const string OutOfStock = "out_of_stock";

    /// <summary>The state changed under a concurrent request (e.g. the order was already moved) - maps to 409.</summary>
    public const string Conflict = "conflict";
}
