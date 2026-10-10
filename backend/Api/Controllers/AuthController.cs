using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Api.Common;
using Api.Security;
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
    private readonly RefreshCookiePolicy _cookiePolicy;

    public AuthController(IAuthService authService, RefreshCookiePolicy cookiePolicy)
    {
        _authService = authService;
        _cookiePolicy = cookiePolicy;
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
            if (result.ErrorCode == ResultErrorCodes.BreachedPassword)
            {
                return BadRequest(ApiResponse<AuthResponseDto>.Fail(result.Errors));
            }

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

    /// <summary>
    /// Удаление собственного аккаунта (App Store 5.1.1(v)). Нужен текущий пароль; под строгим лимитом входа (10/мин на IP) —
    /// чужой украденный access-токен не должен позволять подбирать пароль. Идентификатор берётся только из токена,
    /// поэтому удалить можно лишь свой аккаунт. Все сессии завершаются, персональные данные стираются, заказы и отзывы остаются.
    /// Неверный пароль — 400 (не 401: иначе клиент решит, что сессия умерла); аккаунт администратора — 403; есть активный заказ (не «доставлен»/«отменён») — 409 `active_orders`, проверяется только после пароля.
    /// </summary>
    [Authorize]
    [HttpDelete("me")]
    [EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<IActionResult> DeleteAccount(DeleteAccountRequestDto request, CancellationToken cancellationToken)
    {
        var outcome = await _authService.DeleteAccountAsync(GetUserId(), request.Password, cancellationToken);
        switch (outcome)
        {
            case DeleteAccountOutcome.Deleted:
                Response.Cookies.Delete(RefreshTokenCookie, BuildCookieOptions(null));
                return NoContent();
            case DeleteAccountOutcome.InvalidPassword:
                return BadRequest(ApiResponse<bool>.Fail("Incorrect password."));
            case DeleteAccountOutcome.ActiveOrders:
                return Conflict(ApiResponse<bool>.Fail("active_orders"));
            case DeleteAccountOutcome.NotAllowed:
                return StatusCode(StatusCodes.Status403Forbidden, ApiResponse<bool>.Fail("This account cannot be deleted from the app."));
            default:
                return NotFound(ApiResponse<bool>.Fail("Account not found."));
        }
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

    // Domain / SameSite / Secure depend on where the API is reached (see RefreshCookiePolicy). Delete() must use the same
    // attributes as Append(), or the browser ignores it.
    private CookieOptions BuildCookieOptions(DateTimeOffset? expires) => _cookiePolicy.Build(Request, expires);
}
