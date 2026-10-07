"""Search-as-you-type suggestions against the seeded catalog."""

SUGGEST = "/api/v1/search/suggest"


def _suggest(client, q, **params):
    return client.get(SUGGEST, query_string={"q": q, **params})


def test_fragments_inside_model_numbers_match(client):
    body = _suggest(client, "x3d").get_json()
    assert body["total"] == 3 and body["did_you_mean"] is None
    [cpus] = body["groups"]
    assert cpus["kind"] == "cpu"
    assert {item["name"] for item in cpus["items"]} == {
        "AMD Ryzen 7 7800X3D",
        "AMD Ryzen 7 9800X3D",
        "AMD Ryzen 7 5800X3D",
    }


def test_results_are_grouped_by_kind_with_totals_and_a_per_kind_limit(client):
    body = _suggest(client, "corsair", per_kind=2).get_json()
    groups = {group["kind"]: group for group in body["groups"]}
    assert set(groups) == {"memory", "psu", "case"}
    assert groups["psu"]["total"] == 4 and len(groups["psu"]["items"]) == 2
    assert body["total"] == sum(group["total"] for group in body["groups"]) == 9
    assert all(item["brand"]["name"] == "Corsair" for group in body["groups"] for item in group["items"])


def test_misspellings_get_a_correction_from_catalog_words(client):
    for typed, corrected in (("vengance", "vengeance"), ("samsnug", "samsung")):
        body = _suggest(client, typed).get_json()
        assert body["total"] == 0 and body["did_you_mean"] == corrected


def test_nothing_close_means_no_correction(client):
    assert _suggest(client, "qzxwv").get_json() == {"query": "qzxwv", "total": 0, "groups": [], "did_you_mean": None}


def test_inactive_products_are_never_suggested(client, session, product_by_sku):
    product = product_by_sku("FRG-CPU-R7-5800X3D")
    product.is_active = False
    session.commit()
    names = [item["name"] for group in _suggest(client, "x3d").get_json()["groups"] for item in group["items"]]
    assert "AMD Ryzen 7 5800X3D" not in names


def test_the_query_is_validated(client):
    assert client.get(SUGGEST).status_code == 422
    assert _suggest(client, "x" * 101).status_code == 422
    assert _suggest(client, "x3d", per_kind=9).status_code == 422
