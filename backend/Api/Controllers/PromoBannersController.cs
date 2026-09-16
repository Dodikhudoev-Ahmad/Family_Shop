using Microsoft.AspNetCore.Mvc;
using Api.Common;
using Application.DTOs;
using Application.Interfaces;

namespace Api.Controllers;

/// <summary>Публичные промо-баннеры главной страницы.</summary>
[ApiController]
[Route("api/v1/promo-banners")]
public class PromoBannersController : ControllerBase
{
    private readonly IPromoBannerService _promoBannerService;

    public PromoBannersController(IPromoBannerService promoBannerService)
    {
        _promoBannerService = promoBannerService;
    }

    /// <summary>Активные баннеры, отсортированные по порядку показа.</summary>
    [HttpGet("active")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<PromoBannerDto>>>> GetActive(CancellationToken cancellationToken)
    {
        var banners = await _promoBannerService.GetActiveBannersAsync(cancellationToken);
        return Ok(ApiResponse<IReadOnlyList<PromoBannerDto>>.Ok(banners));
    }
}
