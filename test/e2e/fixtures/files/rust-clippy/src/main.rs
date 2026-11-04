fn greet(name: &str) -> String {
    format!("Hello {name}")
}

fn main() {
    let count = 1;
    if count == count {
        println!("{}", greet("world"));
    }
}
