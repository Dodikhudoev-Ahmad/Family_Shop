namespace Api.Common;

public class ApiResponse<T>
{
    public bool Success { get; init; }
    public T? Data { get; init; }
    public IReadOnlyList<string> Errors { get; init; } = Array.Empty<string>();

    /// <summary>Machine-readable failure kind (e.g. "out_of_stock", "conflict"); absent for plain validation errors.</summary>
    public string? Code { get; init; }

    /// <summary>Details for <see cref="Code"/> (e.g. productId, productName, available).</summary>
    public IReadOnlyDictionary<string, object?>? Meta { get; init; }

    public static ApiResponse<T> Ok(T data) => new() { Success = true, Data = data };
    public static ApiResponse<T> Fail(IReadOnlyList<string> errors) => new() { Success = false, Errors = errors };
    public static ApiResponse<T> Fail(IReadOnlyList<string> errors, string? code, IReadOnlyDictionary<string, object?>? meta) =>
        new() { Success = false, Errors = errors, Code = code, Meta = meta };
    public static ApiResponse<T> Fail(string error) => new() { Success = false, Errors = new[] { error } };
}
