namespace FamilyShop.Api.Common;

public class ApiResponse<T>
{
    public bool Success { get; init; }
    public T? Data { get; init; }
    public IReadOnlyList<string> Errors { get; init; } = Array.Empty<string>();

    public static ApiResponse<T> Ok(T data) => new() { Success = true, Data = data };
    public static ApiResponse<T> Fail(IReadOnlyList<string> errors) => new() { Success = false, Errors = errors };
    public static ApiResponse<T> Fail(string error) => new() { Success = false, Errors = new[] { error } };
}
