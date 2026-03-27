pub fn sql_escape(s: &str) -> String {
    s.replace('\'', "''")
}

pub fn sql_opt(val: &Option<String>) -> String {
    match val {
        Some(s) => format!("'{}'", sql_escape(s)),
        None => "NULL".into(),
    }
}
