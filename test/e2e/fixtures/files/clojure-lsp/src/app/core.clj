(ns app.core)

(defn greet [name]
  (str "Hello " name))

(defn -main []
  (println (greet missing-value)))
