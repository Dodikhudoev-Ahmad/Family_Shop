using System.Net;
using System.Text.Json;
using Api.Common;

namespace Api.Middleware;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            var userId = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "anonymous";
            _logger.LogError(
                ex,
                "Unhandled exception while processing {Method} {Path} for user {UserId}",
                context.Request.Method,
                context.Request.Path,
                userId);

            context.Response.ContentType = "application/json";
            context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;

            var response = ApiResponse<object>.Fail("An unexpected error occurred. Please try again later.");
            await context.Response.WriteAsync(JsonSerializer.Serialize(response));
        }
    }
}
