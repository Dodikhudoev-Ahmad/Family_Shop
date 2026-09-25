using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Api.Common;
using Application.DTOs;
using Application.Interfaces;

namespace Api.Controllers;

/// <summary>Регистрация, вход и обновление токенов.</summary>
[ApiController]
[Route("api/v1/auth")]
[EnableRateLimiting("auth")]
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
    [HttpPost("register")]
    [EnableRateLimiting("auth-register")]
    public async Task<ActionResult<ApiResponse<AuthResponseDto>>> Register(RegisterRequestDto request, CancellationToken cancellationToken)
    {
        var result = await _authService.RegisterAsync(request, cancellationToken);
        if (!result.IsSuccess)
        {
            return Conflict(ApiResponse<AuthResponseDto>.Fail(result.Errors));
        }

        SetRefreshTokenCookie(result.Value!.RefreshToken);
        return Ok(ApiResponse<AuthResponseDto>.Ok(result.Value.Response));
    }

    /// <summary>Вход по email и паролю.</summary>
    [HttpPost("login")]
    public async Task<ActionResult<ApiResponse<AuthResponseDto>>> Login(LoginRequestDto request, CancellationToken cancellationToken)
    {
        var result = await _authService.LoginAsync(request, cancellationToken);
        if (!result.IsSuccess)
        {
            return Unauthorized(ApiResponse<AuthResponseDto>.Fail(result.Errors));
        }

        SetRefreshTokenCookie(result.Value!.RefreshToken);
        return Ok(ApiResponse<AuthResponseDto>.Ok(result.Value.Response));
    }

    /// <summary>Обновление access-токена по refresh-токену из httpOnly cookie (с ротацией).</summary>
    [HttpPost("refresh")]
    [EnableRateLimiting("auth-refresh")]
    public async Task<ActionResult<ApiResponse<AuthResponseDto>>> Refresh(CancellationToken cancellationToken)
    {
        if (!Request.Cookies.TryGetValue(RefreshTokenCookie, out var refreshToken) || string.IsNullOrEmpty(refreshToken))
        {
            return Unauthorized(ApiResponse<AuthResponseDto>.Fail("Refresh token missing."));
        }

        var result = await _authService.RefreshAsync(refreshToken, cancellationToken);
        if (!result.IsSuccess)
        {
            Response.Cookies.Delete(RefreshTokenCookie, BuildCookieOptions(null));
            return Unauthorized(ApiResponse<AuthResponseDto>.Fail(result.Errors));
        }

        SetRefreshTokenCookie(result.Value!.RefreshToken);
        return Ok(ApiResponse<AuthResponseDto>.Ok(result.Value.Response));
    }

    /// <summary>Выход из аккаунта — инвалидация refresh-токена.</summary>
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        if (Request.Cookies.TryGetValue(RefreshTokenCookie, out var refreshToken) && !string.IsNullOrEmpty(refreshToken))
        {
            await _authService.RevokeRefreshTokenAsync(refreshToken, cancellationToken);
        }

        Response.Cookies.Delete(RefreshTokenCookie, BuildCookieOptions(null));
        return NoContent();
    }

    private void SetRefreshTokenCookie(string refreshToken)
    {
        Response.Cookies.Append(RefreshTokenCookie, refreshToken, BuildCookieOptions(DateTimeOffset.UtcNow.AddDays(14)));
    }

    // In production the SPA and the API live on different sites (separate *.up.railway.app
    // hosts, and up.railway.app is on the Public Suffix List), so a SameSite=Strict cookie is
    // rejected outright on the cross-site fetch response and every page reload logged the user
    // out. SameSite=None+Secure lets the browser store/send it; CORS (credentials + strict
    // origin whitelist) still stops other origins from reading the response. Once the SPA and
    // API share one registrable domain (custom domain), this can go back to Strict.
    // Delete() must use the same Path/SameSite/Secure as Append(), or the browser ignores it.
    private CookieOptions BuildCookieOptions(DateTimeOffset? expires) => new()
    {
        HttpOnly = true,
        Secure = true,
        SameSite = _environment.IsDevelopment() ? SameSiteMode.Strict : SameSiteMode.None,
        Expires = expires,
        Path = "/api/v1/auth"
    };
}
