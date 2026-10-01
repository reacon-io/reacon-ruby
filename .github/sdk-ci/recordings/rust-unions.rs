use reacon_sdk::models;
use serde_json::{json, Value};

#[test]
fn experiment_variants_preserve_workflow_message_and_extension_fields() {
    for value in [
        json!({"id":"A","name":"Workflow","nextNodeId":"stop","weight":1.0,"extension":{"enabled":true}}),
        json!({"id":"B","name":"Message","templateId":"template","templateVersion":1.0,"weight":1.0,"extension":null}),
        json!({"id":"C","name":"Both","templateId":"template","templateVersion":1.0,"nextNodeId":"stop","weight":1.0}),
    ] {
        let variant: models::MailExperimentVariant=serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(variant).unwrap(),value);
    }
}

#[test]
fn experiment_variants_reject_missing_required_fields_and_wrong_types() {
    for value in [
        json!({"id":"A","name":"Incomplete","weight":1.0}),
        json!({"id":"A","name":"Workflow","nextNodeId":null,"weight":1.0}),
        json!({"id":"B","name":"Message","templateId":"template","templateVersion":"wrong","weight":1.0}),
    ] {
        assert!(serde_json::from_value::<models::MailExperimentVariant>(value).is_err());
    }
}

#[test]
fn product_inputs_preserve_empty_and_overlapping_shapes() {
    for value in [
        json!({}),
        json!({"domain": "example.invalid"}),
        json!({"limit": 1, "offset": 0}),
        json!({"email": "ada@example.invalid", "idempotencyKey": "synthetic-product-create"}),
    ] {
        let input: models::ProductToolRequestInput = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(input).unwrap(), value);
    }
}

#[test]
fn product_inputs_cannot_discard_unknown_fields_into_an_empty_branch() {
    for value in [json!({"notAProductField": true}), json!({"domain": "example.invalid", "notAProductField": true})] {
        assert!(serde_json::from_value::<models::ProductToolRequestInput>(value).is_err());
    }
}

#[test]
fn cadence_requests_preserve_distinct_node_shapes() {
    for value in [
        json!({"id":"start","name":"Start","kind":"start","nextNodeId":"stop"}),
        json!({"id":"wait","name":"Wait","kind":"wait","durationMs":10,"nextNodeId":"stop"}),
        json!({"id":"stop","name":"Stop","kind":"stop","outcome":"Synthetic fixture"}),
    ] {
        let input: models::MailPostCadencesRequestNodesInner = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(input).unwrap(), value);
    }
}

#[test]
fn cadence_requests_reject_missing_fields_and_unknown_variants() {
    for value in [
        json!({"id":"start","name":"Start","kind":"start"}),
        json!({"id":"start","name":"Start","kind":"unknown"}),
        json!({"id":"stop","name":"Stop","kind":"stop","outcome":"Fixture","unexpected":true}),
    ] {
        assert!(serde_json::from_value::<models::MailPostCadencesRequestNodesInner>(value).is_err());
    }
}

#[test]
fn cadence_responses_preserve_kind_and_branch_fields() {
    for value in [
        json!({"id":"start","name":"Start","kind":"start","nextNodeId":"stop"}),
        json!({"id":"stop","name":"Stop","kind":"stop","outcome":"Synthetic fixture"}),
    ] {
        let response: models::MailCadenceNode = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(response).unwrap(), value);
    }
}

#[test]
fn product_execution_keeps_its_discriminator_once() {
    let value = json!({"executionId":null,"tool":"usage","replay":false,
        "output":{"creditsAvailable":0,"creditsUsed":0,"requests":0,"nextExpiration":null}});
    let response: models::ProductToolExecution = serde_json::from_value(value.clone()).unwrap();
    let bytes = serde_json::to_string(&response).unwrap();
    assert_eq!(bytes.matches("\"tool\"").count(), 1);
    assert_eq!(serde_json::from_str::<Value>(&bytes).unwrap(), value);
}

#[test]
fn product_execution_rejects_missing_or_wrong_discriminator() {
    for value in [
        json!({"executionId":null,"replay":false,"output":{"items":[]}}),
        json!({"executionId":null,"tool":"unknown","replay":false,"output":{"items":[]}}),
        json!({"executionId":null,"tool":"usage","replay":false,"output":{"items":[]}}),
    ] {
        assert!(serde_json::from_value::<models::ProductToolExecution>(value).is_err());
    }
}
