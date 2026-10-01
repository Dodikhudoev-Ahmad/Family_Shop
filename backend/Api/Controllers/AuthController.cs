using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Api.Common;
using Api.Filters;
using Api.RateLimiting;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;

namespace Api.Controllers;

/// <summary>Регистрация, вход и обновление токенов для браузера (refresh-токен — в httpOnly cookie).</summary>
[ApiController]
[Route("api/v1/auth")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class AuthController : ControllerBase
{
    private const string RefreshTokenCookie = "refreshToken";
    private readonly IAuthService _authService;
    private readonly IWebHostEnvironment _environment;

    public AuthController(IAuthService authService, IWebHostEnvironment environment)
    {
        _authService = authService;
        _environment = environment;
    }

    /// <summary>Регистрация нового пользователя.</summary>
    [AllowAnonymous]
    [HttpPost("register")]
    [EnableRateLimiting(RateLimitPolicies.AuthRegister)]
    public async Task<ActionResult<ApiResponse<AuthResponseDto>>> Register(RegisterRequestDto request, CancellationToken cancellationToken)
    {
        var result = await _authService.RegisterAsync(request, SessionContext.Web, cancellationToken);
        if (!result.IsSuccess)
        {
            return Conflict(ApiResponse<AuthResponseDto>.Fail(result.Errors));
        }

        SetRefreshTokenCookie(result.Value!.RefreshToken, result.Value.RefreshTokenExpiresAt);
        return Ok(ApiResponse<AuthResponseDto>.Ok(result.Value.Response));
    }

    /// <summary>Вход по email и паролю.</summary>
    [AllowAnonymous]
    [HttpPost("login")]
    [EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<ActionResult<ApiResponse<AuthResponseDto>>> Login(LoginRequestDto request, CancellationToken cancellationToken)
    {
        var result = await _authService.LoginAsync(request, SessionContext.Web, cancellationToken);
        if (!result.IsSuccess)
        {
            return Unauthorized(ApiResponse<AuthResponseDto>.Fail(result.Errors));
        }

        SetRefreshTokenCookie(result.Value!.RefreshToken, result.Value.RefreshTokenExpiresAt);
        return Ok(ApiResponse<AuthResponseDto>.Ok(result.Value.Response));
    }

    /// <summary>Обновление access-токена по refresh-токену из httpOnly cookie (с ротацией). Требует заголовок X-Requested-With: fetch и допустимый Origin (защита от CSRF).</summary>
    [AllowAnonymous]
    [HttpPost("refresh")]
    [EnableRateLimiting(RateLimitPolicies.AuthRefresh)]
    [ServiceFilter(typeof(CookieCsrfFilter))]
    public async Task<ActionResult<ApiResponse<AuthResponseDto>>> Refresh(CancellationToken cancellationToken)
    {
        if (!Request.Cookies.TryGetValue(RefreshTokenCookie, out var refreshToken) || string.IsNullOrEmpty(refreshToken))
        {
            return Unauthorized(ApiResponse<AuthResponseDto>.Fail("Refresh token missing."));
        }

        var result = await _authService.RefreshAsync(refreshToken, SessionContext.Web, cancellationToken);
        if (!result.IsSuccess)
        {
            Response.Cookies.Delete(RefreshTokenCookie, BuildCookieOptions(null));
            return Unauthorized(ApiResponse<AuthResponseDto>.Fail(result.Errors));
        }

        SetRefreshTokenCookie(result.Value!.RefreshToken, result.Value.RefreshTokenExpiresAt);
        return Ok(ApiResponse<AuthResponseDto>.Ok(result.Value.Response));
    }

    /// <summary>Выход из аккаунта на этом устройстве — сессия (вся цепочка refresh-токенов) отзывается. Требует X-Requested-With: fetch и допустимый Origin.</summary>
    [AllowAnonymous]
    [HttpPost("logout")]
    [EnableRateLimiting(RateLimitPolicies.Auth)]
    [ServiceFilter(typeof(CookieCsrfFilter))]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        if (Request.Cookies.TryGetValue(RefreshTokenCookie, out var refreshToken) && !string.IsNullOrEmpty(refreshToken))
        {
            await _authService.RevokeRefreshTokenAsync(refreshToken, SessionContext.Web, cancellationToken);
        }

        Response.Cookies.Delete(RefreshTokenCookie, BuildCookieOptions(null));
        return NoContent();
    }

    // The three session-management calls below (logout-all, sessions, revoke) deliberately carry NO named
    // rate-limit policy: they need a valid access token already, so credential brute-forcing is not a
    // concern, and the strict login budget (10/min per IP) would only get in the way of a signed-in user.
    // They are still covered by the global 100/min per IP.

    /// <summary>«Выйти со всех устройств»: отзывает все сессии пользователя — веб и мобильные.</summary>
    [Authorize]
    [HttpPost("logout-all")]
    public async Task<IActionResult> LogoutAll(CancellationToken cancellationToken)
    {
        await _authService.LogoutAllAsync(GetUserId(), cancellationToken);
        Response.Cookies.Delete(RefreshTokenCookie, BuildCookieOptions(null));
        return NoContent();
    }

    /// <summary>Активные сессии (устройства) текущего пользователя.</summary>
    [Authorize]
    [HttpGet("sessions")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<SessionDto>>>> GetSessions(CancellationToken cancellationToken)
    {
        var sessions = await _authService.GetSessionsAsync(GetUserId(), GetSessionId(), cancellationToken);
        return Ok(ApiResponse<IReadOnlyList<SessionDto>>.Ok(sessions));
    }

    /// <summary>Выйти на конкретном устройстве. Чужой идентификатор сессии даёт 404, как будто её нет.</summary>
    [Authorize]
    [HttpDelete("sessions/{sessionId:guid}")]
    public async Task<IActionResult> RevokeSession(Guid sessionId, CancellationToken cancellationToken)
    {
        var result = await _authService.RevokeSessionAsync(GetUserId(), sessionId, cancellationToken);
        return result.IsSuccess ? NoContent() : NotFound(ApiResponse<bool>.Fail(result.Errors));
    }

    private int GetUserId() => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private Guid? GetSessionId()
    {
        var raw = User.FindFirstValue("sid") ?? User.FindFirstValue(ClaimTypes.Sid);
        return Guid.TryParse(raw, out var id) ? id : null;
    }

    private void SetRefreshTokenCookie(string refreshToken, DateTime expiresAtUtc)
    {
        Response.Cookies.Append(RefreshTokenCookie, refreshToken, BuildCookieOptions(new DateTimeOffset(DateTime.SpecifyKind(expiresAtUtc, DateTimeKind.Utc))));
    }

    // In production the SPA and the API live on different sites (separate *.up.railway.app
    // hosts, and up.railway.app is on the Public Suffix List), so a SameSite=Strict cookie is
    // rejected outright on the cross-site fetch response and every page reload logged the user
    // out. SameSite=None+Secure lets the browser store/send it; CORS (credentials + strict
    // origin whitelist) still stops other origins from reading the response, and CookieCsrfFilter
    // stops them from using it. Once the SPA and API share one registrable domain (custom domain),
    // this can go back to Strict. Delete() must use the same Path/SameSite/Secure as Append(),
    // or the browser ignores it.
    private CookieOptions BuildCookieOptions(DateTimeOffset? expires) => new()
    {
        HttpOnly = true,
        Secure = true,
        SameSite = _environment.IsDevelopment() ? SameSiteMode.Strict : SameSiteMode.None,
        Expires = expires,
        Path = "/api/v1/auth"
    };
}
